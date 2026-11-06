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

/** Set the conversation status. Returns { prev, next } for event logging. */
async function setStatus(pool, id, status) {
  const cur = await pool.query('SELECT status FROM conversations WHERE id = $1', [id]);
  if (cur.rowCount === 0) return null;
  const prev = cur.rows[0].status;
  await pool.query('UPDATE conversations SET status = $2 WHERE id = $1', [id, status]);
  return { prev, next: status };
}

/** Clear the unread flag (thread opened / read). */
async function markRead(pool, id) {
  await pool.query('UPDATE conversations SET unread = false WHERE id = $1', [id]);
}

/** Set (or clear, with null) the reply tag. Returns { prev, next } or null. */
async function setTag(pool, id, tag) {
  const cur = await pool.query('SELECT tag FROM conversations WHERE id = $1', [id]);
  if (cur.rowCount === 0) return null;
  const prev = cur.rows[0].tag;
  await pool.query('UPDATE conversations SET tag = $2 WHERE id = $1', [id, tag || null]);
  return { prev, next: tag || null };
}

/** Set (or clear) snooze. snoozedUntil null clears it. */
async function setSnooze(pool, id, snoozedUntil, snoozeNote) {
  const r = await pool.query(
    'UPDATE conversations SET snoozed_until = $2, snooze_note = $3 WHERE id = $1',
    [id, snoozedUntil || null, snoozeNote || null],
  );
  return r.rowCount > 0;
}

/** Count conversations currently unread AND not snoozed into the future. */
async function countUnread(pool) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM conversations
      WHERE unread = true AND (snoozed_until IS NULL OR snoozed_until <= now())`,
  );
  return rows[0].n;
}

/**
 * Apply one field change to many conversations. field is 'status'|'tag'|
 * 'snooze'. For snooze, value is an ISO string or null (clear).
 */
async function bulkUpdate(pool, ids, field, value) {
  if (!ids || ids.length === 0) return 0;
  let sql;
  let params;
  if (field === 'status') { sql = 'UPDATE conversations SET status = $2 WHERE id = ANY($1::uuid[])'; params = [ids, value]; }
  else if (field === 'tag') { sql = 'UPDATE conversations SET tag = $2 WHERE id = ANY($1::uuid[])'; params = [ids, value || null]; }
  else if (field === 'snooze') { sql = 'UPDATE conversations SET snoozed_until = $2 WHERE id = ANY($1::uuid[])'; params = [ids, value || null]; }
  else return 0;
  const r = await pool.query(sql, params);
  return r.rowCount;
}

async function listConversations(pool) {
  const { rows } = await pool.query(
    `SELECT c.*, a.email AS account_email,
            p.data->>'fname' AS prospect_fname,
            p.data->>'lname' AS prospect_lname,
            p.data->>'email' AS prospect_email,
            m.snippet AS last_snippet,
            m.direction AS last_direction
       FROM conversations c
       LEFT JOIN email_accounts a ON a.id = c.email_account_id
       LEFT JOIN prospects p ON p.id = c.prospect_id
       LEFT JOIN LATERAL (
         SELECT snippet, direction FROM messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC LIMIT 1
       ) m ON true
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
  );
  return rows;
}

/** One conversation with joined prospect + account fields (thread header). */
async function getWithProspect(pool, id) {
  const { rows } = await pool.query(
    `SELECT c.*, a.email AS account_email,
            p.data->>'fname' AS prospect_fname,
            p.data->>'lname' AS prospect_lname,
            p.data->>'email' AS prospect_email
       FROM conversations c
       LEFT JOIN email_accounts a ON a.id = c.email_account_id
       LEFT JOIN prospects p ON p.id = c.prospect_id
      WHERE c.id = $1`,
    [id],
  );
  return rows[0] || null;
}

module.exports = {
  ensureTable,
  findByThreadId,
  getById,
  upsertForSend,
  setThreadId,
  touchOutbound,
  markInboundReply,
  setStatus,
  markRead,
  setTag,
  setSnooze,
  countUnread,
  bulkUpdate,
  listConversations,
  getWithProspect,
};
