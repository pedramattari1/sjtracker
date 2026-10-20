// Idempotency ledger for the weekly city report. One row per ISO week; an atomic
// claim guarantees at most one send per week across all triggers (in-process
// scheduler, catch-up, external cron, GitHub Actions). Additive table; never
// touches prospects.

const REPORT_TZ = process.env.REPORT_TZ || 'America/Los_Angeles';

// ---- date helpers (pure) ----

/** Wall-clock parts in the report timezone. */
function tzParts(date = new Date(), tz = REPORT_TZ) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour % 24, minute: +p.minute, weekday: p.weekday };
}

/** ISO week key "YYYY-Www" for a given y/m/d. */
function isoWeekKey(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - day + 3); // nearest Thursday
  const isoYear = date.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((date - firstThu) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** The ISO week key for "now" in the report timezone. */
function currentWeekKey(date = new Date(), tz = REPORT_TZ) {
  const p = tzParts(date, tz);
  return isoWeekKey(p.y, p.m, p.d);
}

/**
 * True once we are at/after this week's send time (Monday 08:00 local). ISO weeks
 * run Mon–Sun, so any day Tue–Sun is after Monday 08:00; Monday before 08:00 is not.
 */
function isPastWeeklySend(parts) {
  if (parts.weekday === 'Mon') return parts.hour >= 8;
  return true;
}

// ---- DB layer ----

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_runs (
      week       TEXT PRIMARY KEY,
      status     TEXT NOT NULL,              -- sending | success | failed
      attempt    INT  NOT NULL DEFAULT 0,
      recipients INT,
      prospects  INT,
      error      TEXT,
      sent_at    TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/**
 * Atomically claim the week for sending. Returns true if THIS caller may send.
 * - brand-new week: claim.
 * - already 'success': NEVER re-claim (unless force) — a sent week stays sent.
 * - 'sending' within last 10 min: skip (another trigger is mid-send).
 * - 'failed': re-claim (retry).
 * - stale 'sending' (>10 min, a crashed/stuck attempt): re-claim.
 */
async function tryClaimWeek(pool, week, force = false) {
  if (force) {
    await pool.query(
      `INSERT INTO report_runs (week, status, attempt, updated_at)
       VALUES ($1, 'sending', 1, now())
       ON CONFLICT (week) DO UPDATE SET status='sending',
         attempt=report_runs.attempt+1, updated_at=now()`,
      [week],
    );
    return true;
  }
  // Re-claim ONLY a failed attempt or a stale (stuck) 'sending' attempt.
  // A 'success' row is never re-claimed here — that is what prevents duplicate
  // weekly sends from a late/backup trigger hours after the real send.
  const r = await pool.query(
    `INSERT INTO report_runs (week, status, attempt, updated_at)
     VALUES ($1, 'sending', 1, now())
     ON CONFLICT (week) DO UPDATE SET status='sending',
       attempt=report_runs.attempt+1, updated_at=now()
     WHERE report_runs.status = 'failed'
        OR (report_runs.status = 'sending'
            AND report_runs.updated_at < now() - interval '10 minutes')
     RETURNING week`,
    [week],
  );
  return r.rowCount > 0;
}

async function markSuccess(pool, week, { recipients, prospects }) {
  await pool.query(
    `UPDATE report_runs SET status='success', recipients=$2, prospects=$3,
       error=NULL, sent_at=now(), updated_at=now() WHERE week=$1`,
    [week, recipients, prospects],
  );
}

async function markFailed(pool, week, error) {
  await pool.query(
    `UPDATE report_runs SET status='failed', error=$2, updated_at=now() WHERE week=$1`,
    [week, String(error).slice(0, 500)],
  );
}

async function getWeek(pool, week) {
  const { rows } = await pool.query('SELECT * FROM report_runs WHERE week=$1', [week]);
  return rows[0] || null;
}

module.exports = {
  REPORT_TZ,
  tzParts,
  isoWeekKey,
  currentWeekKey,
  isPastWeeklySend,
  ensureTable,
  tryClaimWeek,
  markSuccess,
  markFailed,
  getWeek,
};
