// Canned-reply snippets (spec §4 `snippets`, §6.6). Small reusable blocks of
// text the composer can insert into a manual reply. Additive table.

async function ensureTable(pool) {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS snippets (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name       text NOT NULL,
      body_text  text NOT NULL,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function list(pool) {
  const { rows } = await pool.query('SELECT * FROM snippets ORDER BY name ASC');
  return rows;
}

async function add(pool, { name, bodyText, createdBy }) {
  const { rows } = await pool.query(
    'INSERT INTO snippets (name, body_text, created_by) VALUES ($1,$2,$3) RETURNING *',
    [name, bodyText, createdBy || null],
  );
  return rows[0];
}

async function remove(pool, id) {
  const r = await pool.query('DELETE FROM snippets WHERE id = $1', [id]);
  return r.rowCount > 0;
}

module.exports = { ensureTable, list, add, remove };
