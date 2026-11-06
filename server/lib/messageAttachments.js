// Attachment metadata for messages (spec §4 `message_attachments`). We store
// metadata only; the bytes live in Gmail and are fetched on demand through the
// Clerk-gated proxy (attachments.get). Additive table; never touches prospects.

async function ensureTable(pool) {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_attachments (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id          uuid REFERENCES messages(id),
      filename            text,
      mime_type           text,
      size_bytes          integer,
      gmail_attachment_id text,
      storage_ref         text,
      direction           text,
      created_at          timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS message_attachments_message_idx ON message_attachments (message_id);',
  );
}

async function insert(pool, a) {
  const { rows } = await pool.query(
    `INSERT INTO message_attachments
       (message_id, filename, mime_type, size_bytes, gmail_attachment_id, storage_ref, direction)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      a.messageId,
      a.filename || null,
      a.mimeType || null,
      a.sizeBytes != null ? a.sizeBytes : null,
      a.gmailAttachmentId || null,
      a.storageRef || null,
      a.direction || null,
    ],
  );
  return rows[0];
}

/** Public attachment rows for a set of messages (no bytes). */
async function listByMessageIds(pool, messageIds) {
  if (!messageIds || messageIds.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT id, message_id, filename, mime_type, size_bytes, direction
       FROM message_attachments
      WHERE message_id = ANY($1::uuid[])
      ORDER BY created_at ASC`,
    [messageIds],
  );
  return rows;
}

/**
 * Everything the download proxy needs for one attachment id: the Gmail
 * attachment id, the parent message's gmail_message_id, and the conversation's
 * sending account (whose token can read the bytes).
 */
async function getForDownload(pool, id) {
  const { rows } = await pool.query(
    `SELECT at.id, at.filename, at.mime_type, at.gmail_attachment_id,
            m.gmail_message_id, c.email_account_id
       FROM message_attachments at
       JOIN messages m ON m.id = at.message_id
       LEFT JOIN conversations c ON c.id = m.conversation_id
      WHERE at.id = $1`,
    [id],
  );
  return rows[0] || null;
}

/** Set the Gmail attachment id after an outbound send (so it's downloadable). */
async function setGmailAttachmentId(pool, id, gmailAttachmentId) {
  await pool.query(
    'UPDATE message_attachments SET gmail_attachment_id = $2 WHERE id = $1',
    [id, gmailAttachmentId],
  );
}

module.exports = {
  ensureTable,
  insert,
  listByMessageIds,
  getForDownload,
  setGmailAttachmentId,
};
