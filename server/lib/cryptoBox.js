// Secret handling for the nurture feature:
//   - encrypt()/decrypt(): AES-256-GCM for the Gmail refresh token at rest.
//   - signState()/verifyState(): HMAC-signed OAuth `state` so the (public)
//     callback can trust which Clerk user + nonce started the flow.
//
// Two different secrets on purpose:
//   TOKEN_ENCRYPTION_KEY  -> token encryption ONLY (32 raw bytes, hex-encoded).
//   UNSUBSCRIBE_SECRET    -> HMAC signing (OAuth state here; unsubscribe later).
// Pure module (no DB, no network) so it is unit-testable without Postgres.

const crypto = require('crypto');

const ENC_ALGO = 'aes-256-gcm';

/**
 * The 32-byte AES key, decoded from TOKEN_ENCRYPTION_KEY as HEX (not UTF-8).
 * A 256-bit key is 64 hex chars. Resolved lazily so the module can be required
 * (e.g. by tests that only exercise HMAC) without the env var set.
 */
function encKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error('TOKEN_ENCRYPTION_KEY not set');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be 32 bytes as hex (64 hex chars); got ${key.length} bytes`,
    );
  }
  return key;
}

/**
 * Encrypt a UTF-8 string. Returns a self-describing compact blob:
 *   v1.<iv_b64>.<tag_b64>.<ciphertext_b64>
 * so decrypt() needs no side channel for the IV/tag.
 */
function encrypt(plaintext) {
  const key = encKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce, recommended for GCM
  const cipher = crypto.createCipheriv(ENC_ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

/** Decrypt a blob produced by encrypt(). Throws if tampered or malformed. */
function decrypt(blob) {
  const parts = String(blob).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('cryptoBox: unrecognized ciphertext format');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = encKey();
  const decipher = crypto.createDecipheriv(ENC_ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

// ---- OAuth state signing (HMAC with UNSUBSCRIBE_SECRET) ----

function stateSecret() {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s) throw new Error('UNSUBSCRIBE_SECRET not set');
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBuf(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/**
 * Sign an arbitrary JSON-able payload into a compact `state` string:
 *   <payload_b64url>.<hmac_b64url>
 * Callers typically pass { uid, nonce, ts }.
 */
function signState(payload) {
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', stateSecret()).update(body).digest();
  return `${body}.${b64url(mac)}`;
}

/**
 * Verify + decode a state string. Returns the payload object, or null if the
 * signature is invalid / malformed / (optionally) older than maxAgeMs.
 */
function verifyState(state, { maxAgeMs } = {}) {
  if (typeof state !== 'string' || !state.includes('.')) return null;
  const [body, macB64] = state.split('.');
  if (!body || !macB64) return null;
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest();
  const given = b64urlToBuf(macB64);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(b64urlToBuf(body).toString('utf8'));
  } catch {
    return null;
  }
  if (maxAgeMs && payload && typeof payload.ts === 'number') {
    if (Date.now() - payload.ts > maxAgeMs) return null;
  }
  return payload;
}

module.exports = { encrypt, decrypt, signState, verifyState };
