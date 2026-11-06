// Unit tests for prospectCrm.computeReengageAt — the re-engage date for parked
// (next_year/later) prospects, ~60 days before the target window. DB-free.
//
//   node test/prospectCrm.test.js   (or: npm test -w server)

const { computeReengageAt } = require('../lib/prospectCrm');

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  (got ${actual}, want ${expected})`);
}

(function run() {
  const now = new Date(Date.UTC(2026, 10, 5)); // 2026-11-05

  // this_year / unknown / empty -> no parking
  check('this_year -> null', computeReengageAt({ timeframe: 'this_year', now }), null);
  check('unknown -> null', computeReengageAt({ timeframe: 'unknown', now }), null);
  check('empty -> null', computeReengageAt({ timeframe: '', now }), null);

  // next_year, no month -> default target Feb 1 next year (2027-02-01) minus 60d
  // 2027-02-01 minus 60 days = 2026-12-03
  check('next_year default -> 60d before Feb 1 next year',
    computeReengageAt({ timeframe: 'next_year', now }), '2026-12-03T00:00:00.000Z');

  // explicit target month wins: 2027-06 -> 2027-06-01 minus 60d = 2027-04-02
  check('explicit target month',
    computeReengageAt({ timeframe: 'later', targetMoveMonth: '2027-06', now }), '2027-04-02T00:00:00.000Z');

  // malformed month falls back to default
  check('malformed month falls back to default',
    computeReengageAt({ timeframe: 'next_year', targetMoveMonth: 'nope', now }), '2026-12-03T00:00:00.000Z');

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();
