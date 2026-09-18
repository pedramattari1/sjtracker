// Standalone data layer for city-report recipients. Additive table — never
// touches the prospects table. Kept as plain functions so the DB round-trip is
// unit-testable and the route handlers stay thin.

function newRecipientId() {
  return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** Create the report_recipients table if absent. Additive; leaves prospects alone. */
async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_recipients (
      id         TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function listRecipients(pool) {
  const { rows } = await pool.query(
    'SELECT id, email, name FROM report_recipients ORDER BY email ASC',
  );
  return rows;
}

async function addRecipient(pool, { email, name }) {
  const id = newRecipientId();
  const clean = { email: (email || '').trim(), name: (name || '').trim() };
  await pool.query(
    'INSERT INTO report_recipients (id, email, name) VALUES ($1, $2, $3)',
    [id, clean.email, clean.name],
  );
  return { id, email: clean.email, name: clean.name };
}

async function removeRecipient(pool, id) {
  const r = await pool.query('DELETE FROM report_recipients WHERE id = $1', [id]);
  return r.rowCount > 0;
}

module.exports = {
  ensureTable,
  listRecipients,
  addRecipient,
  removeRecipient,
  newRecipientId,
};
