// L.I.V.E. SJ Prospect Tracker — API server
// Express + Postgres. No auth (internal team use). Deploy on Railway.

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { clerkMiddleware, getAuth } = require('@clerk/express');
const { buildCsv } = require('./lib/csv');
const { filterProspects } = require('./lib/prospectsFilter');
const { buildReportPayload } = require('./lib/report');
const recipientsDb = require('./lib/recipients');

const app = express();
app.use(cors());               // CORS so the Vercel frontend can call this
app.use(express.json());
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
    const { rows } = await pool.query('SELECT id, ord, data FROM prospects ORDER BY ord ASC, id ASC');
    const records = rows.map(rowToRecord);
    // Recipients are managed in-app (report_recipients table), not env.
    const recipients = (await recipientsDb.listRecipients(pool))
      .map((r) => r.email).filter(Boolean);
    const from = process.env.RESEND_FROM || 'L.I.V.E. SJ Reports <reports@wimmops.com>';

    // Empty list -> clean no-op regardless of RESEND config.
    if (recipients.length === 0) {
      return res.json({ ok: true, emailed: false, reason: 'no recipients', prospects: records.length });
    }
    const payload = buildReportPayload({ records, from, recipients, query: req.query });
    const count = payload._count;

    if (!process.env.RESEND_API_KEY) {
      return res.json({ ok: true, emailed: false, reason: 'RESEND_API_KEY not set', prospects: count, recipients: recipients.length });
    }
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { _count, ...email } = payload;
    void _count;
    const result = await resend.emails.send(email);
    if (result && result.error) {
      console.error('Resend error:', result.error);
      return res.status(502).json({ ok: false, error: 'email_send_failed' });
    }
    return res.json({ ok: true, emailed: true, prospects: count, recipients: recipients.length });
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

const PORT = process.env.PORT || 3000;
initDb()
  .then(() => app.listen(PORT, () => console.log('API listening on ' + PORT)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
