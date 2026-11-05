// Unit tests for lib/cryptoBox — AES-256-GCM token encryption + HMAC OAuth
// state. No DB and no network; runs anywhere. Matches the no-framework check()
// style of reportRuns.test.js.
//
//   node test/cryptoBox.test.js      (or: npm test -w server)

// Fixed test secrets so the suite is self-contained (never the real keys).
process.env.TOKEN_ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY_TEST ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex = 32 bytes
process.env.UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET_TEST || 'test-hmac-secret';

const C = require('../lib/cryptoBox');

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  (got ${actual}, want ${expected})`);
}
function checkTruthy(name, actual) {
  const ok = Boolean(actual);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  (got ${actual})`);
}

(function run() {
  // --- encrypt / decrypt round-trip ---
  const secret = '1//refresh-token-value_ABC.-xyz';
  const blob = C.encrypt(secret);
  check('round-trips to the original plaintext', C.decrypt(blob), secret);
  checkTruthy('ciphertext is versioned (v1.)', blob.startsWith('v1.'));
  checkTruthy('ciphertext does not contain the plaintext', !blob.includes(secret));
  checkTruthy('two encryptions differ (random IV)', C.encrypt(secret) !== C.encrypt(secret));

  // --- tamper detection (GCM auth tag) ---
  const parts = blob.split('.');
  const flipped = Buffer.from(parts[3], 'base64');
  flipped[0] = flipped[0] ^ 0xff;
  const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${flipped.toString('base64')}`;
  let threw = false;
  try { C.decrypt(tampered); } catch { threw = true; }
  check('tampered ciphertext is rejected', threw, true);

  // --- key length guard ---
  const good = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = 'abcd'; // not 32 bytes
  let lenThrew = false;
  try { C.encrypt('x'); } catch { lenThrew = true; }
  check('non-32-byte key is rejected', lenThrew, true);
  process.env.TOKEN_ENCRYPTION_KEY = good;

  // --- OAuth state sign / verify ---
  const payload = { uid: 'user_123', nonce: 'abc', ts: Date.now() };
  const state = C.signState(payload);
  const decoded = C.verifyState(state);
  checkTruthy('valid state verifies', decoded && decoded.uid === 'user_123');
  check('tampered state is rejected', C.verifyState(state + 'x'), null);
  check('garbage state is rejected', C.verifyState('not-a-state'), null);

  // --- state expiry ---
  const old = C.signState({ uid: 'u', nonce: 'n', ts: Date.now() - 60_000 });
  check('expired state is rejected', C.verifyState(old, { maxAgeMs: 1000 }), null);
  checkTruthy('fresh state within window passes', C.verifyState(old, { maxAgeMs: 120_000 }));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();
