// Per-conversation internal notes (spec §6.2 "Notes tab"). Private team notes,
// not emailed to anyone. Additive table; never touches prospects.

async function ensureTable(pool) {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_notes (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid REFERENCES conversations(id),
      author_id       text,
      body            text NOT NULL,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS conversation_notes_convo_idx ON conversation_notes (conversation_id, created_at);',
  );
}

async function add(pool, { conversationId, authorId, body }) {
  const { rows } = await pool.query(
    `INSERT INTO conversation_notes (conversation_id, author_id, body)
     VALUES ($1, $2, $3) RETURNING *`,
    [conversationId, authorId || null, body],
  );
  return rows[0];
}

async function list(pool, conversationId) {
  const { rows } = await pool.query(
    'SELECT * FROM conversation_notes WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId],
  );
  return rows;
}

async function remove(pool, id) {
  const r = await pool.query('DELETE FROM conversation_notes WHERE id = $1', [id]);
  return r.rowCount > 0;
}

module.exports = { ensureTable, add, list, remove };
