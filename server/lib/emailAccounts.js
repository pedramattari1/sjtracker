// Connected Gmail accounts (spec §4 `email_accounts`). Stores the refresh token
// ENCRYPTED (AES-256-GCM via cryptoBox) and the per-account `last_history_id`
// baseline used by the inbound poll. Additive table; never touches prospects.
//
// Thread binding (spec §2.1): a conversation stores the account that originated
// it, and all sends in that conversation use that account. This module just owns
// the account rows; the binding lives on `conversations`.

const { encrypt, decrypt } = require('./cryptoBox');

/**
 * Create email_accounts if absent. uuid pk via gen_random_uuid(); pgcrypto is
 * core on Railway's Postgres 13+, but we CREATE EXTENSION IF NOT EXISTS to be
 * safe (spec §4 note). Additive — leaves prospects alone.
 */
async function ensureTable(pool) {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      clerk_user_id           text,
      email                   text UNIQUE,
      provider                text NOT NULL DEFAULT 'gmail',
      display_name            text,
      refresh_token_encrypted text,
      last_history_id         text,
      status                  text NOT NULL DEFAULT 'active',
      created_at              timestamptz NOT NULL DEFAULT now()
    );
  `);
}

const PUBLIC_COLS = 'id, clerk_user_id, email, provider, display_name, last_history_id, status, created_at';

/**
 * Create or update an account after OAuth. Upsert on `email` so re-consenting
 * the same mailbox refreshes the token/baseline instead of erroring. Stores the
 * refresh token encrypted and seeds last_history_id with the connect-time
 * baseline (spec adjustment: from users.getProfile).
 */
async function upsertAccount(pool, { clerkUserId, email, displayName, refreshToken, historyId }) {
  const enc = encrypt(refreshToken);
  const { rows } = await pool.query(
    `INSERT INTO email_accounts
       (clerk_user_id, email, display_name, refresh_token_encrypted, last_history_id, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (email) DO UPDATE SET
       clerk_user_id = EXCLUDED.clerk_user_id,
       display_name = EXCLUDED.display_name,
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       last_history_id = EXCLUDED.last_history_id,
       status = 'active'
     RETURNING ${PUBLIC_COLS}`,
    [clerkUserId || null, email, displayName || null, enc, historyId ? String(historyId) : null],
  );
  return rows[0];
}

/** All active-or-not accounts, never exposing the encrypted token. */
async function listAccounts(pool) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLS} FROM email_accounts ORDER BY created_at ASC`,
  );
  return rows;
}

async function getById(pool, id) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLS} FROM email_accounts WHERE id = $1`, [id],
  );
  return rows[0] || null;
}

async function getByEmail(pool, email) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLS} FROM email_accounts WHERE email = $1`, [email],
  );
  return rows[0] || null;
}

/** First active account — the default sender for a brand-new conversation. */
async function getDefaultAccount(pool) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLS} FROM email_accounts WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`,
  );
  return rows[0] || null;
}

/** Decrypt the stored refresh token for an account id (server-side only). */
async function getDecryptedRefreshToken(pool, id) {
  const { rows } = await pool.query(
    'SELECT refresh_token_encrypted FROM email_accounts WHERE id = $1', [id],
  );
  if (!rows[0] || !rows[0].refresh_token_encrypted) return null;
  return decrypt(rows[0].refresh_token_encrypted);
}

async function setHistoryId(pool, id, historyId) {
  await pool.query(
    'UPDATE email_accounts SET last_history_id = $2 WHERE id = $1',
    [id, String(historyId)],
  );
}

module.exports = {
  ensureTable,
  upsertAccount,
  listAccounts,
  getById,
  getByEmail,
  getDefaultAccount,
  getDecryptedRefreshToken,
  setHistoryId,
};
