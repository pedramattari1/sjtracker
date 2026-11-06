// Lightweight activity log per conversation (spec §6.2 "activity timeline").
// Records state changes (status, and later tag/snooze/enrollment) so the thread
// timeline can show "Status: Engaged -> Toured" entries interleaved with the
// messages and notes. Additive table; never touches prospects.

async function ensureTable(pool) {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_events (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid REFERENCES conversations(id),
      type            text NOT NULL,     -- status | tag | snooze | note | system
      detail          text,              -- human-readable, e.g. 'engaged -> toured'
      actor_id        text,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS conversation_events_convo_idx ON conversation_events (conversation_id, created_at);',
  );
}

async function log(pool, { conversationId, type, detail, actorId }) {
  const { rows } = await pool.query(
    `INSERT INTO conversation_events (conversation_id, type, detail, actor_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [conversationId, type, detail || null, actorId || null],
  );
  return rows[0];
}

async function listByConversation(pool, conversationId) {
  const { rows } = await pool.query(
    'SELECT * FROM conversation_events WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId],
  );
  return rows;
}

module.exports = { ensureTable, log, listByConversation };
