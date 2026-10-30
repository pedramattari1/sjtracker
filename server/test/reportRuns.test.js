// Regression tests for the weekly-report idempotency claim (server/lib/reportRuns).
//
// Guards the Oct-2026 incident: a late/backup trigger re-sent the weekly report
// because a SUCCESS row older than 10 min was wrongly re-claimed. The critical
// assertion here is "success + stale -> claim:false".
//
// Run against a THROWAWAY/local Postgres (it writes & deletes rows prefixed
// `TEST-<pid>-` in report_runs):
//   DATABASE_URL=postgres://<you>@localhost:5432/sj_tracker_test node test/reportRuns.test.js
// or:  npm test -w server   (with DATABASE_URL set)

const { Pool } = require('pg');
const R = require('../lib/reportRuns');

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error('SKIP: set DATABASE_URL to a throwaway Postgres to run these tests.');
  process.exit(2);
}

const PREFIX = `TEST-${process.pid}-`;
let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  (got ${actual}, want ${expected})`);
}

(async () => {
  const pool = new Pool({ connectionString: URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
  await R.ensureTable(pool);
  const age = (wk, mins) => pool.query('UPDATE report_runs SET updated_at = now() - ($2 * interval \'1 minute\') WHERE week=$1', [wk, mins]);
  const cleanup = () => pool.query('DELETE FROM report_runs WHERE week LIKE $1', [PREFIX + '%']);
  await cleanup();

  // THE incident scenario: success, then a trigger hours later must NOT re-send.
  let wk = PREFIX + 'success-stale';
  await R.tryClaimWeek(pool, wk); await R.markSuccess(pool, wk, { recipients: 6, prospects: 94 });
  await age(wk, 320);
  check('success + stale (>10m) is NOT re-claimed', await R.tryClaimWeek(pool, wk), false);

  wk = PREFIX + 'success-recent';
  await R.tryClaimWeek(pool, wk); await R.markSuccess(pool, wk, { recipients: 6, prospects: 94 });
  check('success (recent) is NOT re-claimed', await R.tryClaimWeek(pool, wk), false);

  check('brand-new week IS claimed', await R.tryClaimWeek(pool, PREFIX + 'new'), true);

  wk = PREFIX + 'sending-recent';
  await R.tryClaimWeek(pool, wk);
  check('sending (recent) is NOT re-claimed', await R.tryClaimWeek(pool, wk), false);

  wk = PREFIX + 'sending-stale';
  await R.tryClaimWeek(pool, wk); await age(wk, 30);
  check('sending (stale >10m) IS re-claimed (stuck recovery)', await R.tryClaimWeek(pool, wk), true);

  wk = PREFIX + 'failed';
  await R.tryClaimWeek(pool, wk); await R.markFailed(pool, wk, 'err');
  check('failed IS re-claimed (retry)', await R.tryClaimWeek(pool, wk), true);

  wk = PREFIX + 'force';
  await R.tryClaimWeek(pool, wk); await R.markSuccess(pool, wk, { recipients: 6, prospects: 94 }); await age(wk, 320);
  check('force overrides a stale success', await R.tryClaimWeek(pool, wk, true), true);

  // ISO-week helper sanity
  check('isoWeekKey(2026,9,28) == 2026-W40', R.isoWeekKey(2026, 9, 28), '2026-W40');
  check('isPastWeeklySend Mon 07:00 == false', R.isPastWeeklySend({ weekday: 'Mon', hour: 7 }), false);
  check('isPastWeeklySend Mon 08:00 == true', R.isPastWeeklySend({ weekday: 'Mon', hour: 8 }), true);

  await cleanup();
  await pool.end();
  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
