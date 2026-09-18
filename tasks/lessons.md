# tasks/lessons.md — sjtracker

Patterns learned from corrections + hard-won facts. Review at session start.

## Data / backend
- **Real JSONB keys (introspected 2026-09-18):** `fname`, `lname`, `email`, `phone`,
  `referred`, `responded`, `status`, `unitpref`, `toured`, `stage`, `notes`.
  The API flattens the row id to `_id` and `ord` to `order`. Do NOT assume the
  BUILD_PLAN's guessed names (`name`, `dateContacted`, `unitPreference`,
  `leasingStage`) — they are wrong. Always read live data before coding against it.
- The `prospects` table is live and **growing** (60 rows on 2026-09-18, up from 33).
  Treat as production; back up before any schema/data change.

## Build / tooling
- `/web` package.json is `"type": "module"`, so all config files (`tailwind.config.js`,
  `postcss.config.js`) must use ESM `import`, never `require()` — `require` throws
  `ReferenceError: require is not defined`. Import plugins:
  `import animate from "tailwindcss-animate"; plugins: [animate]`.

## Process
- Backups live off-Railway in `~/Downloads/`: a JSON snapshot and a self-contained
  `sjtracker-restore-*.sql` (recreates table + upserts all rows).
- Phase 0 makes no DB changes, so no pg_dump was strictly required; a restorable
  `.sql` built from the API snapshot covers the same need for this 3-column table.
