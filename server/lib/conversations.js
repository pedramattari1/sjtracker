// Conversations (spec §4 `conversations`): one row per prospect×sending-account
// thread, bound to the Gmail account that originated it. Additive table.
//
// Phase 1 uses the subset needed to prove the round-trip: create/bind on first
// send, find by gmail_thread_id for inbound matching, and flip unread/engaged
// when a reply lands. FKs to prospects are TEXT (prospects.id is TEXT).

async function ensureTable(pool) {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      prospect_id      text REFERENCES prospects(id),
      email_account_id uuid REFERENCES email_accounts(id),
      gmail_thread_id  text,
      subject          text,
      status           text NOT NULL DEFAULT 'contacted',
      tag              text,
      unread           boolean NOT NULL DEFAULT false,
      snoozed_until    timestamptz,
      snooze_note      text,
      last_message_at  timestamptz,
      created_at       timestamptz NOT NULL DEFAULT now(),
      UNIQUE (prospect_id, email_account_id)
    );
  `);
  // Inbound matching is by thread id — index it.
  await pool.query(
    'CREATE INDEX IF NOT EXISTS conversations_gmail_thread_id_idx ON conversations (gmail_thread_id);',
  );
}

async function findByThreadId(pool, gmailThreadId) {
  if (!gmailThreadId) return null;
  const { rows } = await pool.query(
    'SELECT * FROM conversations WHERE gmail_thread_id = $1 LIMIT 1', [gmailThreadId],
  );
  return rows[0] || null;
}

async function getById(pool, id) {
  const { rows } = await pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
  return rows[0] || null;
}

/**
 * Find or create the conversation for (prospect, account) before an outbound
 * send. prospectId may be null for an ad-hoc test send to a raw address. When
 * prospectId is set we rely on the UNIQUE(prospect_id, email_account_id)
 * constraint to keep one thread per prospect×account.
 */
async function upsertForSend(pool, { prospectId, emailAccountId, subject }) {
  if (prospectId) {
    const existing = await pool.query(
      'SELECT * FROM conversations WHERE prospect_id = $1 AND email_account_id = $2 LIMIT 1',
      [prospectId, emailAccountId],
    );
    if (existing.rows[0]) return existing.rows[0];
  }
  const { rows } = await pool.query(
    `INSERT INTO conversations (prospect_id, email_account_id, subject, status)
     VALUES ($1, $2, $3, 'contacted')
     RETURNING *`,
    [prospectId || null, emailAccountId, subject || null],
  );
  return rows[0];
}

/** After the first outbound creates the Gmail thread, persist its id. */
async function setThreadId(pool, id, gmailThreadId) {
  await pool.query(
    'UPDATE conversations SET gmail_thread_id = $2 WHERE id = $1 AND gmail_thread_id IS NULL',
    [id, gmailThreadId],
  );
}

async function touchOutbound(pool, id, sentAtIso) {
  await pool.query(
    'UPDATE conversations SET last_message_at = $2 WHERE id = $1',
    [id, sentAtIso || new Date().toISOString()],
  );
}

/**
 * A reply landed: flip to unread + engaged, bump last_message_at, clear any
 * snooze (spec §2.4). Idempotent.
 */
async function markInboundReply(pool, id, receivedAtIso) {
  await pool.query(
    `UPDATE conversations
       SET unread = true, status = 'engaged', snoozed_until = NULL,
           last_message_at = GREATEST(COALESCE(last_message_at, $2), $2)
     WHERE id = $1`,
    [id, receivedAtIso || new Date().toISOString()],
  );
}

async function listConversations(pool) {
  const { rows } = await pool.query(
    `SELECT c.*, a.email AS account_email, p.data->>'fname' AS prospect_fname,
            p.data->>'email' AS prospect_email
       FROM conversations c
       LEFT JOIN email_accounts a ON a.id = c.email_account_id
       LEFT JOIN prospects p ON p.id = c.prospect_id
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
  );
  return rows;
}

module.exports = {
  ensureTable,
  findByThreadId,
  getById,
  upsertForSend,
  setThreadId,
  touchOutbound,
  markInboundReply,
  listConversations,
};
