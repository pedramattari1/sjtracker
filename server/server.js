// L.I.V.E. SJ Prospect Tracker — API server
// Express + Postgres. No auth (internal team use). Deploy on Railway.

// Local dev convenience: load a .env if present. No-op in production (Railway
// injects env) and no hard dependency — if dotenv isn't installed we carry on.
try { require('dotenv').config(); } catch { /* dotenv optional (prod uses injected env) */ }

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { clerkMiddleware, getAuth } = require('@clerk/express');
const { buildCsv } = require('./lib/csv');
const { filterProspects } = require('./lib/prospectsFilter');
const { buildReportPayload } = require('./lib/report');
const recipientsDb = require('./lib/recipients');
const reportRuns = require('./lib/reportRuns');
const cron = require('node-cron');

// --- Nurture / two-way messaging (Phase 1) ---
const cryptoBox = require('./lib/cryptoBox');
const google = require('./lib/google');
const emailAccounts = require('./lib/emailAccounts');
const conversations = require('./lib/conversations');
const messages = require('./lib/messages');
const messageAttachments = require('./lib/messageAttachments');
const gmailSync = require('./lib/gmailSync');
const quoted = require('./lib/quoted');
const conversationNotes = require('./lib/conversationNotes');
const conversationEvents = require('./lib/conversationEvents');
const prospectCrm = require('./lib/prospectCrm');
const snippets = require('./lib/snippets');

const app = express();
app.use(cors());               // CORS so the Vercel frontend can call this
// JSON body parsing with the default 100kb limit for every route EXCEPT the
// message-send path, which carries base64 attachments and gets its own
// route-scoped parser with a higher limit (see the send route). Keeping the
// bigger limit off the global parser avoids buffering large bodies app-wide.
const parseJson = express.json();
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/messages/send') return next();
  return parseJson(req, res, next);
});
app.use(clerkMiddleware());    // attaches auth to req; verifies the Clerk session

// Gate every /api/prospects route: no/invalid Clerk token -> 401 (JSON, not a
// redirect — this is an API). The health route (GET /) stays public. The Phase 5
// report route will use a separate CRON_SECRET guard, not Clerk.
function auth(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// Railway injects DATABASE_URL when you attach a Postgres service.
// Internal Railway connections don't need SSL; set DATABASE_SSL=true only if
// you connect over the public proxy URL.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const FIELDS = ['fname','lname','email','phone','referred','responded','status','unitpref','toured','stage','notes'];
function clean(rec) {
  const o = {};
  FIELDS.forEach(k => { o[k] = rec[k] !== undefined && rec[k] !== null ? rec[k] : ''; });
  return o;
}
function rowToRecord(r) {
  return Object.assign({ _id: r.id, order: r.ord }, r.data);
}

const SEED = [
  {fname:'Ellesia',lname:'Janto',email:'ellesia.sanjose@gmail.com',phone:'',referred:'2026-08-12',responded:'yes',status:'warm',unitpref:'',toured:'scheduled',stage:'Scheduling call / tour',notes:'Very enthusiastic. Requested call at 1:30 PM on Aug 17. Josh intro Aug 12, Ariel confirmed.'},
  {fname:'Francisco',lname:'Lozano',email:'franciscolozano@ymail.com',phone:'',referred:'2026-08-14',responded:'yes',status:'warm',unitpref:'1 Bedroom',toured:'no',stage:'Scheduling call / tour',notes:'Responded asking about tour (Wed/Thu late afternoon). Ariel offered Wed–Thu 12–2 PM. Follow-up: asking about 1BR availability, floor/direction, price breakdown with subsidy, underground/off-site parking.'},
  {fname:'Tommy',lname:'McClain',email:'mcclain.thomas42@gmail.com',phone:'(619) 647-3189',referred:'2026-08-14',responded:'yes',status:'none',unitpref:'',toured:'no',stage:'Not proceeding',notes:'Questions: income cap (salary to $160,270 exceeds 110% AMI), rent increase caps between leases, longest lease durations. Decided to hold off — income cap risk. Open to future programs.'},
  {fname:'Lee',lname:'Baker',email:'leebaker999@gmail.com',phone:'',referred:'2026-08-19',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Josh intro sent Aug 19. No reply — follow up.'},
  {fname:'Avery',lname:'T.',email:'averyt80@gmail.com',phone:'',referred:'',responded:'no',status:'new',unitpref:'',toured:'no',stage:'Initial outreach',notes:''},
  {fname:'Tyler',lname:'Linvill',email:'Tyler.Linvill@sanjoseca.gov',phone:'',referred:'',responded:'no',status:'new',unitpref:'',toured:'no',stage:'Initial outreach',notes:'City of San José employee.'},
  {fname:'D.C.',lname:'Jr.',email:'Dcjr25two@yahoo.com',phone:'',referred:'',responded:'no',status:'new',unitpref:'',toured:'no',stage:'Initial outreach',notes:''},
  {fname:'Sherina',lname:'Guimmond',email:'Sherina.guimmond@gmail.com',phone:'',referred:'',responded:'no',status:'new',unitpref:'',toured:'no',stage:'Initial outreach',notes:''},
  {fname:'Allen',lname:'Holbrook',email:'allenholbrook@gmail.com',phone:'',referred:'',responded:'no',status:'new',unitpref:'',toured:'no',stage:'Initial outreach',notes:''},
  {fname:'Daniel Bryan',lname:'Aguilar',email:'danielbryan.aguilar@gmail.com',phone:'',referred:'',responded:'no',status:'new',unitpref:'',toured:'no',stage:'Initial outreach',notes:''},
  {fname:'Griselda',lname:'Suarez',email:'suarezgriselda26@gmail.com',phone:'',referred:'',responded:'no',status:'new',unitpref:'',toured:'no',stage:'Initial outreach',notes:''},
  {fname:'Davis',lname:'Chancellor',email:'Davischancellor@yahoo.com',phone:'',referred:'',responded:'no',status:'new',unitpref:'',toured:'no',stage:'Initial outreach',notes:''},
  {fname:'Connie',lname:'Valenzuela',email:'valenzuelaconnie202@gmail.com',phone:'',referred:'',responded:'no',status:'new',unitpref:'',toured:'no',stage:'Initial outreach',notes:''},
  {fname:'Gloria',lname:'Mendoza',email:'gemendoza@icloud.com',phone:'',referred:'2026-08-31',responded:'yes',status:'warm',unitpref:'1BR or 2BR',toured:'scheduled',stage:'Tour scheduled',notes:'Interested in 1BR and 2BR. Getting back to book a tour for later this week.'},
  {fname:'Sky',lname:'Kerstein',email:'sky.kerstein@sjsu.edu',phone:'',referred:'2026-08-31',responded:'yes',status:'warm',unitpref:'1 Bedroom',toured:'scheduled',stage:'Tour scheduled',notes:'Scheduled a tour for tomorrow to tour a 1BR.'},
  {fname:'Samantha',lname:'Deanda',email:'samantha.deanda@sjsu.edu',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted 8/31. No response yet.'},
  {fname:'Diana',lname:'Osruano',email:'dianaosruano@gmail.com',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted 8/31. No response yet.'},
  {fname:'Erik',lname:'Pierce',email:'erik.pierce@isd.sccgov.org',phone:'',referred:'2026-08-31',responded:'yes',status:'warm',unitpref:'',toured:'scheduled',stage:'Tour scheduled',notes:'Tour booked. Questions: Is vehicle parking included in price? Is the price in the email the subsidized price? When are units available for move-in?'},
  {fname:'Jessica',lname:'Magar',email:'jessicaemagar@gmail.com',phone:'',referred:'2026-08-31',responded:'yes',status:'warm',unitpref:'2 Bedroom',toured:'yes',stage:'Application in progress',notes:'Already toured. Wants to move forward applying for 2BR with parking. Note: no parking available at this time — needs to be addressed.'},
  {fname:'Juan',lname:'Rodriguez',email:'Juan.Rodriguez@asm.ca.gov',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response.'},
  {fname:'Elizabeth',lname:'Barragan',email:'elizabeth.barragan@sjlibrary.org',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response.'},
  {fname:'Imani',lname:'Sires',email:'imani.sires@sjsu.edu',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response.'},
  {fname:'Brian',lname:'Verma',email:'Brian.Verma@sanjoseca.gov',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response. City of San José employee.'},
  {fname:'Omar',lname:'Flores',email:'Flores_O@vta.org',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response.'},
  {fname:'Arthur',lname:'Hernandez',email:'Arthur1.Hernandez@sanjoseca.gov',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response. City of San José employee.'},
  {fname:'Adrian',lname:'Tamayo-Perez',email:'Adrian.Tamayo-Perez@sanjoseca.gov',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response. City of San José employee.'},
  {fname:'Marta',lname:'Dominguez',email:'Marta.Dominguez@sanjoseca.gov',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response. City of San José employee.'},
  {fname:'Sheldon',lname:'Bakhtiari',email:'Sheldon.Bakhtiari@gmail.com',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response.'},
  {fname:'Enrique',lname:'',email:'Dzunoeceja@gmail.com',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response. Last name not provided.'},
  {fname:'Janelle',lname:'Resuello',email:'jresuello@sunnyvale.ca.gov',phone:'',referred:'2026-08-31',responded:'yes',status:'warm',unitpref:'',toured:'scheduled',stage:'Tour scheduled',notes:'Tour booked for Sunday 9/6. Josh answered eligibility questions. Note: may be looking at BMR — confirm L.I.V.E. program eligibility.'},
  {fname:'Julie',lname:'Barajas',email:'Julie.barajas@ssa.sccgov.org',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response.'},
  {fname:'Giovanni',lname:'Cazares',email:'Giovanni.Cazares@sanjoseca.gov',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response. City of San José employee.'},
  {fname:'Anthony',lname:'Rodriguez',email:'anrodriguez@scscourt.org',phone:'',referred:'2026-08-31',responded:'no',status:'follow',unitpref:'',toured:'no',stage:'Initial outreach',notes:'Contacted to book tour 8/31. No response.'}
];

function newId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prospects (
      id   TEXT PRIMARY KEY,
      ord  DOUBLE PRECISION,
      data JSONB NOT NULL
    );
  `);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM prospects');
  if (rows[0].n === 0) {
    for (let i = 0; i < SEED.length; i++) {
      await pool.query(
        'INSERT INTO prospects (id, ord, data) VALUES ($1, $2, $3)',
        ['seed_' + i, i, JSON.stringify(clean(SEED[i]))]
      );
    }
    console.log('Seeded ' + SEED.length + ' prospects.');
  }
  await recipientsDb.ensureTable(pool); // additive; does not touch prospects
  await reportRuns.ensureTable(pool);   // additive; idempotency ledger

  // Nurture feature tables (all additive; prospects untouched). Order matters:
  // conversations/messages FK email_accounts.
  await emailAccounts.ensureTable(pool);
  await conversations.ensureTable(pool);
  await messages.ensureTable(pool);
  await conversationNotes.ensureTable(pool);   // Phase 2
  await conversationEvents.ensureTable(pool);  // Phase 2
  await messageAttachments.ensureTable(pool);  // Phase 2b
  await prospectCrm.ensureTable(pool);         // Phase 3
  await snippets.ensureTable(pool);            // Phase 3
  // Additive index to match inbound/prospect lookups by email (spec §4).
  await pool.query(
    "CREATE INDEX IF NOT EXISTS prospects_email_idx ON prospects ((lower(data->>'email')));",
  );
}

// ---- Weekly report: one guarded path for all triggers ----

async function pingHealthcheck() {
  if (!process.env.HEALTHCHECK_URL) return;
  try { await fetch(process.env.HEALTHCHECK_URL, { method: 'GET' }); }
  catch (e) { console.error('healthcheck ping failed:', e.message); }
}

async function adminAlert(subject, body) {
  if (!process.env.ADMIN_ALERT_EMAIL || !process.env.RESEND_API_KEY) return;
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM || 'L.I.V.E. SJ Reports <reports@wimmops.com>',
      to: [process.env.ADMIN_ALERT_EMAIL],
      subject,
      text: body,
    });
  } catch (e) { console.error('admin alert failed:', e.message); }
}

/**
 * Build + send the weekly city report, idempotent per ISO week. Safe to call from
 * any trigger; at most one send per week (unless force). Returns a plain result.
 */
async function runCityReport({ force = false, trigger = 'manual' } = {}) {
  const recipients = (await recipientsDb.listRecipients(pool)).map((r) => r.email).filter(Boolean);
  if (recipients.length === 0) {
    return { ok: true, emailed: false, reason: 'no recipients', trigger };
  }
  if (!process.env.RESEND_API_KEY) {
    return { ok: true, emailed: false, reason: 'RESEND_API_KEY not set', trigger };
  }

  const week = reportRuns.currentWeekKey();
  const claimed = await reportRuns.tryClaimWeek(pool, week, force);
  if (!claimed) {
    const existing = await reportRuns.getWeek(pool, week);
    return { ok: true, emailed: false, skipped: true, reason: 'already sent this week', week, status: existing && existing.status, trigger };
  }

  try {
    const { rows } = await pool.query('SELECT id, ord, data FROM prospects ORDER BY ord ASC, id ASC');
    const records = rows.map(rowToRecord);
    const from = process.env.RESEND_FROM || 'L.I.V.E. SJ Reports <reports@wimmops.com>';
    const payload = buildReportPayload({ records, from, recipients });
    const count = payload._count;

    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { _count, ...email } = payload;
    void _count;
    const result = await resend.emails.send(email);
    if (result && result.error) throw new Error(JSON.stringify(result.error));

    await reportRuns.markSuccess(pool, week, { recipients: recipients.length, prospects: count });
    await pingHealthcheck();
    console.log(`[report] sent week=${week} trigger=${trigger} prospects=${count} recipients=${recipients.length}`);
    return { ok: true, emailed: true, week, prospects: count, recipients: recipients.length, trigger };
  } catch (e) {
    console.error('[report] failed:', e.message);
    await reportRuns.markFailed(pool, week, e.message);
    await adminAlert('L.I.V.E. SJ report FAILED', `Week ${week} (${trigger}) failed: ${e.message}`);
    return { ok: false, error: 'email_send_failed', week, trigger };
  }
}

// In-process scheduler (primary) + catch-up (resilience).
function startScheduler() {
  const expr = process.env.REPORT_CRON || '0 8 * * 1'; // Mondays 08:00 local
  cron.schedule(expr, () => {
    // REPORT_FORCE=1 is a temporary test aid so a scheduled fire can re-send
    // within an already-sent week; unset in normal operation.
    const force = process.env.REPORT_FORCE === '1';
    void runCityReport({ trigger: 'cron', force });
  }, { timezone: reportRuns.REPORT_TZ });
  console.log(`[scheduler] weekly report at "${expr}" ${reportRuns.REPORT_TZ}${process.env.REPORT_FORCE === '1' ? ' (FORCE)' : ''}`);

  if (process.env.REPORT_CATCHUP === 'off') {
    console.log('[scheduler] catch-up disabled (REPORT_CATCHUP=off)');
    return;
  }

  async function maybeCatchup() {
    try {
      const parts = reportRuns.tzParts();
      if (!reportRuns.isPastWeeklySend(parts)) return; // before Mon 08:00 — wait for cron
      const week = reportRuns.currentWeekKey();
      const existing = await reportRuns.getWeek(pool, week);
      if (existing && existing.status === 'success') return; // already sent
      const r = await runCityReport({ trigger: 'catchup' });
      if (r.emailed) console.log('[scheduler] catch-up sent', week);
    } catch (e) { console.error('[scheduler] catch-up error:', e.message); }
  }
  setTimeout(() => { void maybeCatchup(); }, 15000);      // shortly after boot
  setInterval(() => { void maybeCatchup(); }, 3600 * 1000); // hourly
}

// --- Routes ---
app.get('/', (_req, res) => res.json({ ok: true, service: 'sj-tracker-api' }));

app.get('/api/prospects', auth, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, ord, data FROM prospects ORDER BY ord ASC, id ASC');
    res.json(rows.map(rowToRecord));
  } catch (e) { console.error(e); res.status(500).json({ error: 'read_failed' }); }
});

// Scheduled city report — machine-triggered (GitHub Actions), guarded by
// CRON_SECRET via the x-cron-secret header (NOT Clerk). Builds the CSV via the
// Phase 4 units and emails it as an attachment via Resend. Resend is a no-op when
// RESEND_API_KEY is unset, so local runs don't crash.
app.post('/api/reports/city-export', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const provided = req.get('x-cron-secret');
  if (!secret) return res.status(500).json({ error: 'cron_secret_not_configured' });
  if (!provided || provided !== secret) return res.status(401).json({ error: 'unauthorized' });
  try {
    const result = await runCityReport({ force: req.query.force === '1', trigger: 'http' });
    return res.status(result.error ? 502 : 200).json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: 'report_failed' }); }
});

// ---- City-report recipients (Clerk-protected CRUD) ----
app.get('/api/recipients', auth, async (_req, res) => {
  try {
    res.json(await recipientsDb.listRecipients(pool));
  } catch (e) { console.error(e); res.status(500).json({ error: 'read_failed' }); }
});

app.post('/api/recipients', auth, async (req, res) => {
  try {
    const email = (req.body && req.body.email ? String(req.body.email) : '').trim();
    const name = (req.body && req.body.name ? String(req.body.name) : '').trim();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    const rec = await recipientsDb.addRecipient(pool, { email, name });
    res.json(rec);
  } catch (e) { console.error(e); res.status(500).json({ error: 'create_failed' }); }
});

app.delete('/api/recipients/:id', auth, async (req, res) => {
  try {
    await recipientsDb.removeRecipient(pool, req.params.id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'delete_failed' }); }
});

// CSV export — honors the same filter query params as the Prospects view.
app.get('/api/prospects/export', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, ord, data FROM prospects ORDER BY ord ASC, id ASC');
    const records = filterProspects(rows.map(rowToRecord), req.query);
    const csv = buildCsv(records);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="prospects-${date}.csv"`);
    res.send(csv);
  } catch (e) { console.error(e); res.status(500).json({ error: 'export_failed' }); }
});

app.post('/api/prospects', auth, async (req, res) => {
  try {
    const id = newId();
    const ord = Date.now();
    const data = clean(req.body || {});
    await pool.query('INSERT INTO prospects (id, ord, data) VALUES ($1, $2, $3)', [id, ord, JSON.stringify(data)]);
    res.json(Object.assign({ _id: id, order: ord }, data));
  } catch (e) { console.error(e); res.status(500).json({ error: 'create_failed' }); }
});

app.put('/api/prospects/:id', auth, async (req, res) => {
  try {
    const data = clean(req.body || {});
    const r = await pool.query('UPDATE prospects SET data = $2 WHERE id = $1', [req.params.id, JSON.stringify(data)]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    res.json(Object.assign({ _id: req.params.id }, data));
  } catch (e) { console.error(e); res.status(500).json({ error: 'update_failed' }); }
});

app.delete('/api/prospects/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM prospects WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'delete_failed' }); }
});

// ======================================================================
// Nurture / two-way messaging — Phase 1 (email plumbing, one account)
// ======================================================================

// --- OAuth connect (user-consent). Start is Clerk-gated; the callback is
// public (Google redirects the browser with no Clerk token) and trusted via a
// signed `state` carrying the Clerk userId + a nonce.

app.get('/api/oauth/google/start', auth, (req, res) => {
  try {
    const { userId } = getAuth(req);
    const state = cryptoBox.signState({
      uid: userId,
      nonce: Math.random().toString(36).slice(2),
      ts: Date.now(),
    });
    return res.json({ url: google.buildAuthUrl(state) });
  } catch (e) {
    console.error('[oauth] start failed:', e.message);
    return res.status(500).json({ error: 'oauth_start_failed' });
  }
});

app.get('/api/oauth/google/callback', async (req, res) => {
  const appBase = process.env.APP_BASE_URL || '/';
  const fail = (reason) => res.redirect(`${appBase}/messaging?connected=0&reason=${encodeURIComponent(reason)}`);
  try {
    const { code, state, error } = req.query;
    if (error) return fail(String(error));
    if (!code || !state) return fail('missing_code_or_state');

    // 10-minute window on the signed state.
    const payload = cryptoBox.verifyState(String(state), { maxAgeMs: 10 * 60 * 1000 });
    if (!payload) return fail('bad_state');

    const tokens = await google.exchangeCode(String(code));
    if (!tokens.refresh_token) {
      // Google only returns a refresh token on first consent / with prompt=consent.
      return fail('no_refresh_token');
    }

    // Identify the mailbox + seed the inbound poll baseline from the profile
    // historyId (required adjustment — otherwise the first history.list has no
    // starting point).
    const profile = await google.getProfile(tokens.access_token);
    const email = profile.emailAddress;

    await emailAccounts.upsertAccount(pool, {
      clerkUserId: payload.uid,
      email,
      displayName: email,
      refreshToken: tokens.refresh_token,
      historyId: profile.historyId,
    });

    console.log(`[oauth] connected ${email} (historyId baseline ${profile.historyId})`);
    return res.redirect(`${appBase}/messaging?connected=1&email=${encodeURIComponent(email)}`);
  } catch (e) {
    console.error('[oauth] callback failed:', e.message);
    return fail('callback_error');
  }
});

// List connected accounts (never exposes tokens).
app.get('/api/email-accounts', auth, async (_req, res) => {
  try { res.json(await emailAccounts.listAccounts(pool)); }
  catch (e) { console.error(e); res.status(500).json({ error: 'read_failed' }); }
});

// Conversations + their messages (prove inbound landed).
app.get('/api/conversations', auth, async (_req, res) => {
  try { res.json(await conversations.listConversations(pool)); }
  catch (e) { console.error(e); res.status(500).json({ error: 'read_failed' }); }
});

app.get('/api/conversations/:id/messages', auth, async (req, res) => {
  try {
    const rows = await messages.listByConversation(pool, req.params.id);
    // Attachment metadata per message (Phase 2b; bytes fetched on demand).
    const attByMsg = {};
    const atts = await messageAttachments.listByMessageIds(pool, rows.map((m) => m.id));
    for (const a of atts) (attByMsg[a.message_id] ||= []).push(a);
    // Server-side quoted-history strip (Phase 2): the bubble shows body_visible
    // and reveals body_quoted behind a "show quoted text" expander. Raw
    // body_text is left untouched for anyone who needs the full source.
    const withSplit = rows.map((m) => {
      const s = quoted.splitQuoted(m.body_text || '', m.body_html || '');
      return {
        ...m,
        body_visible: s.visible,
        body_quoted: s.quoted,
        has_quoted: s.hasQuoted,
        attachments: attByMsg[m.id] || [],
      };
    });
    res.json(withSplit);
  } catch (e) { console.error(e); res.status(500).json({ error: 'read_failed' }); }
});

// Update a conversation: status, mark-read (Phase 2); tag, snooze (Phase 3).
// A field is changed only when its key is present in the body:
//   status: string · read: true · tag: string|null · snoozed_until: ISO|null
app.patch('/api/conversations/:id', auth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const id = req.params.id;
    const body = req.body || {};
    let changed = false;

    if (typeof body.status === 'string' && body.status.trim()) {
      const result = await conversations.setStatus(pool, id, body.status.trim());
      if (!result) return res.status(404).json({ error: 'not_found' });
      if (result.prev !== result.next) {
        await conversationEvents.log(pool, {
          conversationId: id, type: 'status',
          detail: `${result.prev || '—'} → ${result.next}`, actorId: userId,
        });
      }
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'tag')) {
      const tag = body.tag ? String(body.tag) : null;
      const result = await conversations.setTag(pool, id, tag);
      if (result && result.prev !== result.next) {
        await conversationEvents.log(pool, {
          conversationId: id, type: 'tag',
          detail: tag ? `tagged ${tag}` : 'tag cleared', actorId: userId,
        });
      }
      changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'snoozed_until')) {
      const until = body.snoozed_until ? String(body.snoozed_until) : null;
      await conversations.setSnooze(pool, id, until, body.snooze_note ? String(body.snooze_note) : null);
      await conversationEvents.log(pool, {
        conversationId: id, type: 'snooze',
        detail: until ? `snoozed until ${until}` : 'snooze cleared', actorId: userId,
      });
      changed = true;
    }

    if (body.read === true) { await conversations.markRead(pool, id); changed = true; }

    if (!changed) return res.status(400).json({ error: 'nothing_to_update' });
    res.json(await conversations.getWithProspect(pool, id));
  } catch (e) { console.error('[conversations] patch failed:', e.message); res.status(500).json({ error: 'update_failed' }); }
});

// Bulk action over many conversations (Phase 3: status | tag | snooze | clear_snooze).
app.post('/api/conversations/bulk', auth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const body = req.body || {};
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'no_ids' });

    let field;
    let value;
    let detail;
    if (body.action === 'status') { field = 'status'; value = String(body.value || '').trim(); detail = `status → ${value}`; if (!value) return res.status(400).json({ error: 'missing_value' }); }
    else if (body.action === 'tag') { field = 'tag'; value = body.value ? String(body.value) : null; detail = value ? `tagged ${value}` : 'tag cleared'; }
    else if (body.action === 'snooze') { field = 'snooze'; value = body.value ? String(body.value) : null; detail = value ? `snoozed until ${value}` : 'snooze cleared'; }
    else if (body.action === 'clear_snooze') { field = 'snooze'; value = null; detail = 'snooze cleared'; }
    else return res.status(400).json({ error: 'bad_action' });

    const n = await conversations.bulkUpdate(pool, ids, field, value);
    for (const id of ids) {
      await conversationEvents.log(pool, { conversationId: id, type: field, detail: `(bulk) ${detail}`, actorId: userId });
    }
    res.json({ ok: true, updated: n });
  } catch (e) { console.error('[conversations] bulk failed:', e.message); res.status(500).json({ error: 'bulk_failed' }); }
});

// Unread badge count (excludes threads snoozed into the future).
app.get('/api/conversations/unread-count', auth, async (_req, res) => {
  try { res.json({ count: await conversations.countUnread(pool) }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'read_failed' }); }
});

// Prospect CRM facts (side table; prospects JSONB untouched).
app.get('/api/prospects/:id/crm', auth, async (req, res) => {
  try { res.json((await prospectCrm.get(pool, req.params.id)) || {}); }
  catch (e) { console.error(e); res.status(500).json({ error: 'read_failed' }); }
});

app.put('/api/prospects/:id/crm', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const row = await prospectCrm.upsert(pool, req.params.id, {
      timeframe: b.timeframe,
      targetMoveMonth: b.target_move_month,
      unitInterest: b.unit_interest,
      budget: b.budget,
      source: b.source,
    });
    res.json(row);
  } catch (e) { console.error('[crm] upsert failed:', e.message); res.status(500).json({ error: 'update_failed' }); }
});

// Canned-reply snippets.
app.get('/api/snippets', auth, async (_req, res) => {
  try { res.json(await snippets.list(pool)); }
  catch (e) { console.error(e); res.status(500).json({ error: 'read_failed' }); }
});

app.post('/api/snippets', auth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const name = (req.body && req.body.name ? String(req.body.name) : '').trim();
    const bodyText = (req.body && req.body.body_text ? String(req.body.body_text) : '').trim();
    if (!name || !bodyText) return res.status(400).json({ error: 'name_and_body_required' });
    res.json(await snippets.add(pool, { name, bodyText, createdBy: userId }));
  } catch (e) { console.error(e); res.status(500).json({ error: 'create_failed' }); }
});

app.delete('/api/snippets/:id', auth, async (req, res) => {
  try { await snippets.remove(pool, req.params.id); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'delete_failed' }); }
});

// Conversation notes (internal; never emailed).
app.get('/api/conversations/:id/notes', auth, async (req, res) => {
  try { res.json(await conversationNotes.list(pool, req.params.id)); }
  catch (e) { console.error(e); res.status(500).json({ error: 'read_failed' }); }
});

app.post('/api/conversations/:id/notes', auth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const body = (req.body && req.body.body ? String(req.body.body) : '').trim();
    if (!body) return res.status(400).json({ error: 'empty_note' });
    const note = await conversationNotes.add(pool, { conversationId: req.params.id, authorId: userId, body });
    await conversationEvents.log(pool, { conversationId: req.params.id, type: 'note', detail: 'note added', actorId: userId });
    res.json(note);
  } catch (e) { console.error(e); res.status(500).json({ error: 'create_failed' }); }
});

app.delete('/api/conversations/:id/notes/:noteId', auth, async (req, res) => {
  try { await conversationNotes.remove(pool, req.params.noteId); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'delete_failed' }); }
});

// Activity events for the timeline.
app.get('/api/conversations/:id/events', auth, async (req, res) => {
  try { res.json(await conversationEvents.listByConversation(pool, req.params.id)); }
  catch (e) { console.error(e); res.status(500).json({ error: 'read_failed' }); }
});

/**
 * Send an in-app message as a real Gmail email (spec §2.3). Thread-bound: if the
 * prospect already has a conversation, reuse its account + Gmail thread and set
 * threading headers; otherwise start a new thread from the default account.
 * Body: { conversationId?, prospectId?, toEmail?, subject, bodyText, bodyHtml? }
 * When conversationId is given (replying from the inbox) the thread's bound
 * account is used and the recipient defaults to the latest inbound sender.
 */
// Route-scoped JSON parser with a higher limit so base64 attachments aren't
// rejected by the global 100kb default. 30mb of base64 comfortably holds the
// ~15mb binary cap enforced below (base64 inflates ~33%).
const sendJson = express.json({ limit: '30mb' });

// ~15 MB total of binary attachment content keeps the whole encoded message
// under Gmail's 25 MB limit after base64 inflation (spec/owner guidance).
const MAX_ATTACH_BYTES = 15 * 1024 * 1024;

/** Decoded byte length of a base64 string (without allocating the buffer). */
function base64Bytes(b64) {
  const s = String(b64 || '').replace(/\s+/g, '');
  if (!s) return 0;
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - padding;
}

app.post('/api/messages/send', sendJson, auth, async (req, res) => {
  try {
    const { conversationId, prospectId, subject, bodyText, bodyHtml } = req.body || {};
    let toEmail = (req.body && req.body.toEmail ? String(req.body.toEmail) : '').trim();

    // Validate + size-cap attachments up front.
    const rawAttachments = Array.isArray(req.body && req.body.attachments) ? req.body.attachments : [];
    const attachments = rawAttachments
      .filter((a) => a && a.dataBase64)
      .map((a) => ({
        filename: String(a.filename || 'attachment'),
        mimeType: String(a.mimeType || 'application/octet-stream'),
        dataBase64: String(a.dataBase64),
      }));
    const totalBytes = attachments.reduce((n, a) => n + base64Bytes(a.dataBase64), 0);
    if (totalBytes > MAX_ATTACH_BYTES) {
      return res.status(413).json({
        error: 'attachment_too_large',
        detail: `Attachments total ${(totalBytes / 1048576).toFixed(1)} MB; the limit is 15 MB.`,
      });
    }

    let convo = null;
    let account = null;

    // Replying into an existing thread: bind to that conversation's account and
    // default the recipient to whoever last wrote in (the prospect).
    if (conversationId) {
      convo = await conversations.getById(pool, conversationId);
      if (!convo) return res.status(404).json({ error: 'conversation_not_found' });
      account = await emailAccounts.getById(pool, convo.email_account_id);
      if (!toEmail) {
        const inbound = await pool.query(
          `SELECT from_email FROM messages
            WHERE conversation_id = $1 AND direction = 'inbound' AND from_email IS NOT NULL
            ORDER BY created_at DESC LIMIT 1`,
          [conversationId],
        );
        toEmail = (inbound.rows[0] && inbound.rows[0].from_email ? String(inbound.rows[0].from_email) : '').trim();
        // Fall back to the bound prospect's email.
        if ((!toEmail || !toEmail.includes('@')) && convo.prospect_id) {
          const r = await pool.query("SELECT data->>'email' AS email FROM prospects WHERE id = $1", [convo.prospect_id]);
          toEmail = (r.rows[0] && r.rows[0].email ? String(r.rows[0].email) : '').trim();
        }
      }
    }

    // Resolve the recipient from the prospect when not given explicitly.
    if (!toEmail && prospectId) {
      const r = await pool.query("SELECT data->>'email' AS email FROM prospects WHERE id = $1", [prospectId]);
      toEmail = (r.rows[0] && r.rows[0].email ? String(r.rows[0].email) : '').trim();
    }
    // A plain "from_email" can be "Name <addr>" — extract the address for validation.
    const addrMatch = toEmail.match(/<([^>]+)>/);
    const toAddr = (addrMatch ? addrMatch[1] : toEmail).trim();
    if (!toAddr || !toAddr.includes('@')) return res.status(400).json({ error: 'invalid_recipient' });
    toEmail = toAddr;

    // Pick the sending account: thread's account (above), else the prospect's
    // existing thread account, else default.
    if (!convo && prospectId) {
      const existing = await pool.query(
        'SELECT * FROM conversations WHERE prospect_id = $1 ORDER BY created_at ASC LIMIT 1', [prospectId],
      );
      convo = existing.rows[0] || null;
      if (convo) account = await emailAccounts.getById(pool, convo.email_account_id);
    }
    if (!account) account = await emailAccounts.getDefaultAccount(pool);
    if (!account) return res.status(400).json({ error: 'no_connected_account' });

    // Ensure a conversation bound to this account.
    if (!convo) {
      convo = await conversations.upsertForSend(pool, { prospectId, emailAccountId: account.id, subject });
    }

    // Threading headers from the last message in the thread (if any).
    let inReplyTo = null;
    let references = null;
    if (convo.gmail_thread_id) {
      const last = await messages.lastInThread(pool, convo.gmail_thread_id);
      if (last && last.rfc822_message_id) {
        inReplyTo = last.rfc822_message_id;
        references = last.rfc822_message_id;
      }
    }

    const { raw, messageId } = google.buildMime({
      fromEmail: account.email,
      fromName: account.display_name,
      toEmail,
      subject: subject || '',
      bodyText: bodyText || '',
      bodyHtml: bodyHtml || '',
      inReplyTo,
      references,
      attachments,
    });

    const refreshToken = await emailAccounts.getDecryptedRefreshToken(pool, account.id);
    if (!refreshToken) return res.status(500).json({ error: 'account_missing_token' });
    const accessToken = await google.refreshAccessToken(refreshToken);

    let sent;
    try {
      sent = await google.gmailSend({ accessToken, raw, threadId: convo.gmail_thread_id || undefined });
    } catch (e) {
      // Gmail rejects a message over 25 MB encoded — surface a clear message
      // rather than a generic failure.
      if (/size|too large|limit|413/i.test(e.message)) {
        return res.status(413).json({ error: 'attachment_too_large', detail: 'Gmail rejected the message as too large. Try smaller attachments.' });
      }
      throw e;
    }

    // Persist thread id (first send) + the outbound message.
    if (!convo.gmail_thread_id && sent.threadId) {
      await conversations.setThreadId(pool, convo.id, sent.threadId);
      convo.gmail_thread_id = sent.threadId;
    }
    const nowIso = new Date().toISOString();
    const stored = await messages.insertMessage(pool, {
      conversationId: convo.id,
      direction: 'outbound',
      gmailMessageId: sent.id,
      gmailThreadId: sent.threadId,
      rfc822MessageId: messageId,
      fromEmail: account.email,
      toEmail,
      subject: subject || '',
      bodyHtml: bodyHtml || '',
      bodyText: bodyText || '',
      snippet: (bodyText || '').slice(0, 140),
      sentAt: nowIso,
    });
    await conversations.touchOutbound(pool, convo.id, nowIso);

    // Persist outbound attachment metadata. Then best-effort read the sent
    // message back to capture each attachment's Gmail id so it's downloadable
    // through the proxy (non-fatal — the send already succeeded).
    if (attachments.length && stored) {
      const storedRows = [];
      for (const a of attachments) {
        const row = await messageAttachments.insert(pool, {
          messageId: stored.id,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: base64Bytes(a.dataBase64),
          direction: 'outbound',
        });
        storedRows.push(row);
      }
      try {
        const full = await google.messageGet({ accessToken, id: sent.id });
        const parts = google.extractAttachments(full.payload || {});
        // Match by filename (best effort); fall back to positional order.
        storedRows.forEach((row, i) => {
          const match = parts.find((p) => p.filename === row.filename) || parts[i];
          if (match && match.attachmentId) {
            void messageAttachments.setGmailAttachmentId(pool, row.id, match.attachmentId);
          }
        });
      } catch (e) { console.error('[send] outbound attachment id capture failed:', e.message); }
    }

    return res.json({
      ok: true,
      conversationId: convo.id,
      gmailThreadId: sent.threadId,
      gmailMessageId: sent.id,
      message: stored,
    });
  } catch (e) {
    console.error('[send] failed:', e.message);
    return res.status(502).json({ error: 'send_failed', detail: e.message });
  }
});

// Kick an immediate inbound sync (so testing doesn't wait for the 90s poll).
app.post('/api/sync/run', auth, async (_req, res) => {
  try { res.json({ ok: true, results: await gmailSync.syncAll(pool) }); }
  catch (e) { console.error('[sync] run failed:', e.message); res.status(500).json({ error: 'sync_failed' }); }
});

// Download one attachment's bytes (Clerk-gated proxy). Looks up the Gmail
// attachment id + its message + the conversation's sending account, refreshes
// that account's token, fetches the bytes via attachments.get, and streams them.
app.get('/api/attachments/:attId', auth, async (req, res) => {
  try {
    const row = await messageAttachments.getForDownload(pool, req.params.attId);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (!row.gmail_attachment_id || !row.gmail_message_id || !row.email_account_id) {
      return res.status(409).json({ error: 'attachment_not_fetchable' });
    }
    const refreshToken = await emailAccounts.getDecryptedRefreshToken(pool, row.email_account_id);
    if (!refreshToken) return res.status(500).json({ error: 'account_missing_token' });
    const accessToken = await google.refreshAccessToken(refreshToken);
    const att = await google.attachmentGet({
      accessToken, messageId: row.gmail_message_id, attachmentId: row.gmail_attachment_id,
    });
    const buf = Buffer.from(String(att.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const safeName = (row.filename || 'attachment').replace(/["\r\n]/g, '_');
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.send(buf);
  } catch (e) {
    console.error('[attachment] download failed:', e.message);
    res.status(502).json({ error: 'download_failed' });
  }
});

const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log('API listening on ' + PORT));
    startScheduler();
    gmailSync.startInboundPoll(pool); // in-process inbound poll (Phase 1)
  })
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
