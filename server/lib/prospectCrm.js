// Side table of nurture CRM facts per prospect (spec §4 `prospect_crm`). The
// prospects table + its JSONB are left untouched; this holds timeframe, target
// move month, computed re-engage date, and a few free fields. FK prospect_id is
// TEXT (prospects.id is TEXT). Additive.

/**
 * Compute the re-engage date for a parked prospect (spec §3.3): ~60 days before
 * the target move window. Only next_year/later park; this_year/unknown/"" do not
 * (returns null). Default target = Q1 next year (Feb 1) when only "next year" is
 * known; an explicit target_move_month ('YYYY-MM') wins.
 *
 * Pure (no DB). `now` injectable for tests. Returns an ISO string or null.
 */
function computeReengageAt({ timeframe, targetMoveMonth, now = new Date() } = {}) {
  if (timeframe !== 'next_year' && timeframe !== 'later') return null;

  let target;
  if (targetMoveMonth && /^\d{4}-\d{2}$/.test(targetMoveMonth)) {
    const [y, m] = targetMoveMonth.split('-').map(Number);
    target = new Date(Date.UTC(y, m - 1, 1));
  } else {
    // Default: Q1 of next year (Feb 1) relative to `now`.
    target = new Date(Date.UTC(now.getUTCFullYear() + 1, 1, 1));
  }
  const reengage = new Date(target.getTime() - 60 * 24 * 3600 * 1000);
  return reengage.toISOString();
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prospect_crm (
      prospect_id      text PRIMARY KEY REFERENCES prospects(id),
      timeframe        text,            -- this_year | next_year | later | unknown
      target_move_month text,           -- 'YYYY-MM'
      reengage_at      timestamptz,
      unit_interest    text,
      budget           text,
      source           text,
      updated_at       timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function get(pool, prospectId) {
  const { rows } = await pool.query('SELECT * FROM prospect_crm WHERE prospect_id = $1', [prospectId]);
  return rows[0] || null;
}

/**
 * Upsert CRM facts. Recomputes reengage_at from timeframe + target_move_month so
 * parking (next_year/later) is automatic and consistent.
 */
async function upsert(pool, prospectId, { timeframe, targetMoveMonth, unitInterest, budget, source }) {
  const reengageAt = computeReengageAt({ timeframe, targetMoveMonth });
  const { rows } = await pool.query(
    `INSERT INTO prospect_crm
       (prospect_id, timeframe, target_move_month, reengage_at, unit_interest, budget, source, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (prospect_id) DO UPDATE SET
       timeframe = EXCLUDED.timeframe,
       target_move_month = EXCLUDED.target_move_month,
       reengage_at = EXCLUDED.reengage_at,
       unit_interest = EXCLUDED.unit_interest,
       budget = EXCLUDED.budget,
       source = EXCLUDED.source,
       updated_at = now()
     RETURNING *`,
    [
      prospectId,
      timeframe || null,
      targetMoveMonth || null,
      reengageAt,
      unitInterest || null,
      budget || null,
      source || null,
    ],
  );
  return rows[0];
}

module.exports = { ensureTable, get, upsert, computeReengageAt };
