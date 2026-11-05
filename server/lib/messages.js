// Messages (spec §4 `messages`): the stored outbound + inbound emails for each
// conversation. `gmail_message_id` is UNIQUE — that is the idempotency key that
// keeps the inbound poll from double-storing the same reply (spec §2.4, §11).
// Additive table.

async function ensureTable(pool) {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id   uuid REFERENCES conversations(id),
      direction         text CHECK (direction IN ('outbound','inbound')),
      gmail_message_id  text UNIQUE,
      gmail_thread_id   text,
      rfc822_message_id text,
      from_email        text,
      to_email          text,
      subject           text,
      body_html         text,
      body_text         text,
      snippet           text,
      is_bounce         boolean NOT NULL DEFAULT false,
      sent_at           timestamptz,
      received_at       timestamptz,
      created_at        timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages (conversation_id, created_at);',
  );
}

async function existsByGmailId(pool, gmailMessageId) {
  if (!gmailMessageId) return false;
  const { rows } = await pool.query(
    'SELECT 1 FROM messages WHERE gmail_message_id = $1 LIMIT 1', [gmailMessageId],
  );
  return rows.length > 0;
}

/**
 * Insert a message. ON CONFLICT (gmail_message_id) DO NOTHING makes inbound
 * storage idempotent even under concurrent poll cycles. Returns the row, or
 * null if it was a duplicate.
 */
async function insertMessage(pool, m) {
  const { rows } = await pool.query(
    `INSERT INTO messages
       (conversation_id, direction, gmail_message_id, gmail_thread_id, rfc822_message_id,
        from_email, to_email, subject, body_html, body_text, snippet, is_bounce, sent_at, received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (gmail_message_id) DO NOTHING
     RETURNING *`,
    [
      m.conversationId || null,
      m.direction,
      m.gmailMessageId || null,
      m.gmailThreadId || null,
      m.rfc822MessageId || null,
      m.fromEmail || null,
      m.toEmail || null,
      m.subject || null,
      m.bodyHtml || null,
      m.bodyText || null,
      m.snippet || null,
      Boolean(m.isBounce),
      m.sentAt || null,
      m.receivedAt || null,
    ],
  );
  return rows[0] || null;
}

async function listByConversation(pool, conversationId) {
  const { rows } = await pool.query(
    `SELECT id, conversation_id, direction, gmail_message_id, rfc822_message_id,
            from_email, to_email, subject, body_text, body_html, snippet, is_bounce,
            sent_at, received_at, created_at
       FROM messages WHERE conversation_id = $1
      ORDER BY created_at ASC`,
    [conversationId],
  );
  return rows;
}

/** The newest message in a thread — used to set In-Reply-To/References on sends. */
async function lastInThread(pool, gmailThreadId) {
  const { rows } = await pool.query(
    `SELECT * FROM messages WHERE gmail_thread_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [gmailThreadId],
  );
  return rows[0] || null;
}

module.exports = {
  ensureTable,
  existsByGmailId,
  insertMessage,
  listByConversation,
  lastInThread,
};
