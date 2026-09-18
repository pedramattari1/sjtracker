# tasks/todo.md — sjtracker rebuild

## Phase 0 — Backup, workspace prep, branch (✅ DONE 2026-09-18)

**Goal:** solid ground. Repo becomes an npm-workspaces monorepo with a clean,
buildable (empty) `/web` app on a new branch. **No code features, no DB changes,
`main` keeps deploying the current app.**

### Preconditions (must be true before I execute)
- [ ] **`pg_dump` backup exists off-Railway** — YOU run it; confirm to me. (Blocking.)
- [x] JSON data snapshot captured (read-only, via API) → `~/Downloads/sjtracker-prospects-backup-20260918-134203.json` (60 rows).
- [x] Live JSONB keys introspected: `fname, lname, email, phone, referred, responded, status, unitpref, toured, stage, notes` (+ `_id`, `order`).

### Steps (only after you approve AND pg_dump is confirmed)
- [ ] 1. Create branch `rebuild` from `main`. Do NOT alter what `main` deploys.
- [ ] 2. Add root `package.json` with `"workspaces": ["server","web"]` and a
       `.gitignore` that already covers `node_modules`. Do **not** modify `/server`
       behavior — only make it a workspace member (it already has its own
       package.json). Leave `/public` in place (retired later, at cutover).
- [ ] 3. Scaffold `/web`: Vite + React + TypeScript, Tailwind, shadcn/ui init.
       A blank app that builds clean. TypeScript strict, no `any`.
- [ ] 4. Add `.env.example` files for `/web` (`VITE_CLERK_PUBLISHABLE_KEY`,
       `VITE_API_BASE_URL`) and `/server` (`DATABASE_URL`, `CLERK_SECRET_KEY`,
       `CLERK_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `CRON_SECRET`,
       `CITY_REPORT_RECIPIENTS`) — placeholders only, never real values.
- [ ] 5. Add `tasks/todo.md` (this file) and `tasks/lessons.md` to the repo.

### Explicitly OUT of scope for Phase 0 (do not build ahead)
- No Clerk wiring, no auth middleware, no nav shell, no dashboard, no table port.
- No changes to `/server` routes or the data layer. No schema/DB writes of any kind.
- No changes to Vercel/Railway settings. No merge to `main`.

### Definition of Done
- `npm install` at repo root succeeds (installs both workspaces).
- `npm run build -w web` is clean (blank app builds).
- `/server` still starts unchanged (`node server/server.js` boots as before).
- `main` is untouched and still deploys the current app.
- Nothing wrote to the database. `pg_dump` backup confirmed present beforehand.

### How I'll verify (proof required before marking done)
- Paste `npm run build -w web` output (clean).
- Boot `/server` locally against a throwaway/local DB (not prod) or dry syntax
  check — confirm no behavior change.
- `git status` shows work only on `rebuild`; `git log main` unchanged.

---

## Phase 1 — Shell + Clerk (web + server) + port table (✅ DONE 2026-09-18)

**Goal:** authed skeleton; live table visible inside nav shell; API secured server-side.

### Steps
- [x] 1. Clerk on `/web` (`@clerk/clerk-react`): ClerkProvider, `<SignedOut>` shows
       sign-in, `<SignedIn>` shows app. Signed-out users can't reach data.
- [x] 2. Nav shell (`react-router-dom`): sidebar Dashboard / Prospects / Reports.
       Dashboard & Reports are Phase-1 placeholders (content in Phase 2/5).
- [x] 3. Server-side Clerk on `/server` (`@clerk/express`): `clerkMiddleware()` +
       `getAuth()` guard on every `/api/prospects` route → 401 JSON when unauthenticated.
       Health `GET /` public. Raw `pg` kept; no ORM; table untouched.
- [x] 4. `/web` attaches the Clerk token (`getToken()`) as `Authorization: Bearer`.
- [x] 5. Ported the prospects table into the Prospects view against the LIVE API —
       renders every real field; read-only this phase; 5s polling kept.

### Definition of Done — status
- [x] typecheck + lint + build clean.
- [x] Signed-out user cannot see prospect data.
- [x] no token → 401, invalid token → 401 (proven by curl).
- [~] valid token → 200 — deferred to live: will confirm once `CLERK_SECRET_KEY`
      is set in Railway and Pedram signs into the deployed app. 401 proofs cover
      the security-critical cases.
- [x] `main` untouched.

## Phase 2 — Dashboard view (✅ DONE 2026-09-18)

### Steps
- [x] 1. Shared `lib/filters.ts`: tile predicates + stage order + applying set —
       single source of truth for counts and deep-link filters.
- [x] 2. Dashboard: 5 status tiles.
- [x] 3. Unit-type breakdown with counts (incl. Not indicated).
- [x] 4. Leasing-stage funnel/bars with counts, in leasing order.
- [x] 5. Deep-link tiles/segments into Prospects; Prospects applies a single
       URL-driven filter with a "Filtered: … / Clear" banner.
- [x] Dashboard is now the landing route (`/` → `/dashboard`).

## Phase 3 — Prospects view: filters, search, inline edit, CRUD (✅ DONE 2026-09-18)

### Steps
- [x] 1. `lib/constants.ts`: status/toured/unit/stage/responded options + labels.
- [x] 2. `lib/filters.ts`: pure `applyControls` (AND-combined) + `sortRows`.
- [x] 3. `api.ts`: create/update/delete (update sends FULL record) + `toInput`.
- [x] 4. `ProspectModal`: add/edit with all 11 current-app fields.
- [x] 5. Prospects: sortable columns, combinable filters + search, result count,
       inline status <select>, add/edit/delete (delete confirms); Phase-2 deep-link
       banner still applies (AND-combined).

## Phase 4 — CSV export (✅ DONE 2026-09-18)

### Steps
- [x] 1. `server/lib/csv.js`: standalone `buildCsv` (RFC-4180 escaping all fields,
       header, CRLF, UTF-8 BOM).
- [x] 2. `server/lib/prospectsFilter.js`: standalone `filterProspects` (view params).
- [x] 3. `server.js`: `GET /api/prospects/export` (Clerk `auth`) reuses both.
- [x] 4. `web`: `downloadProspectsCsv` + Export button sending current filter params.

### Review
**What changed:** two standalone, reusable server modules (`lib/csv.js`,
`lib/prospectsFilter.js`); new Clerk-protected `GET /api/prospects/export` that
reads rows, filters via the shared function, and streams a `text/csv` attachment;
`downloadProspectsCsv` (token fetch → blob → download) and an Export button that
serializes the current controls + deep-link into query params. Read-only; no
schema/table changes.

**How verified:**
- typecheck / lint / build clean; `node --check server.js` OK.
- **Escaping (shown):** a record with `O"Brien, Jr.` and notes containing a comma,
  `""quotes""`, and two newlines → parsed back to exactly 11 header + 11 data
  columns; notes round-trips byte-for-byte. BOM + CRLF present (Excel-clean).
- **Filtered export == view:** filterProspects vs manual predicate vs CSV data-row
  count all equal — all 60; warm∧1BR 12; tile=follow 28 (= Dashboard tile);
  stage=Tour scheduled∧toured=scheduled 9; search "san" 11.

**Next:** Phase 5 (scheduled email report).

## Phase 5 — Scheduled email report (✅ DONE 2026-09-18)

### Steps
- [x] 1. `server/lib/report.js`: `buildReportPayload` reuses Phase 4 units.
- [x] 2. `server.js`: `POST /api/reports/city-export` — `x-cron-secret` guard,
       Resend no-op when key absent.
- [x] 3. `.github/workflows/city-report.yml`: weekly Mon + dispatch; UTC/DST + 60d notes.
- [x] 4. `web`: read-only Reports section (recipients + cadence).

### Review
**What changed:** `server/lib/report.js` (`buildReportPayload` — pure, reuses
`filterProspects`+`buildCsv`, base64 CSV attachment); `POST /api/reports/city-export`
guarded by `x-cron-secret` (== `CRON_SECRET`), NOT Clerk — builds the report and
sends via Resend, no-op when `RESEND_API_KEY` unset; GitHub Actions workflow
(weekly Mon 16:00 UTC ≈ 08:00 PT + `workflow_dispatch`, fails job on non-2xx);
read-only Reports view (cadence + recipients, recipients optional via
`VITE_CITY_REPORT_RECIPIENTS`). Added `resend` dep. Read-only on data.

**How verified:**
- typecheck / lint / build clean; `node --check server.js` OK.
- **Payload builder:** to==recipients, from correct, subject dated, filename
  `sj-prospects-<date>.csv`, attachment decodes to the exact Phase-4 CSV (BOM + 60
  data rows); filter honored (status=warm → 17).
- **Guard (curl):** no header → **401**; wrong header → **401**; correct header,
  no `RESEND_API_KEY` → **200** `{emailed:false,"RESEND_API_KEY not set",prospects:33}`
  (no crash — Resend no-op).
- **Send path:** correct secret + a bogus `RESEND_API_KEY` + recipient → code calls
  Resend, which rejects (`401 API key is invalid`) → endpoint returns **502
  email_send_failed**, proving it reaches `resend.emails.send` (not the no-op branch).

**Left to Pedram (deferred, like the valid-token check):**
- Set `RESEND_API_KEY`, `RESEND_FROM`, `CITY_REPORT_RECIPIENTS`, `CRON_SECRET` in
  the Railway service; confirm `wimmops.com` verified in Resend.
- Add GitHub repo secrets `API_BASE_URL` + `CRON_SECRET` (same value as Railway).
- Run the workflow via **workflow_dispatch** to confirm real delivery to an inbox.

**Next:** Phase 5.5 (in-app recipient management).

## Phase 5.5 — In-app recipient management (✅ DONE 2026-09-18)

### Steps
- [x] 1. `server/lib/recipients.js`: `ensureTable` (additive `report_recipients`) +
       `listRecipients`/`addRecipient`/`removeRecipient` — standalone, DB-tested.
- [x] 2. `server.js`: Clerk-protected `GET/POST/DELETE /api/recipients`; `initDb`
       ensures the table.
- [x] 3. `city-export`: reads recipients from the table; empty → clean no-op.
- [x] 4. `web`: Reports view lists/adds/removes recipients via the protected API.

### Review
**What changed:** new additive `report_recipients` table (created in `initDb`;
`prospects` untouched); `server/lib/recipients.js` (standalone CRUD); Clerk-protected
`GET/POST/DELETE /api/recipients`; `POST /api/reports/city-export` now reads the
table (env `CITY_REPORT_RECIPIENTS` no longer used) and no-ops cleanly on an empty
list; Reports view rewritten to list/add/remove recipients (email + optional name)
via the protected API. `city-export` stays CRON_SECRET-guarded.

**How verified:**
- typecheck / lint / build clean; `node --check server.js` OK.
- **CRUD DB round-trip** (via the functions the endpoints call): 0 → add×2 → 2 →
  remove 1 → 1 → remove → 0.
- **Endpoint gating:** `GET /api/recipients` without a token → 401.
- **Report reads table + no-op:** empty table → `emailed:false, "no recipients"`
  (200, no crash); after inserting one recipient → `recipients:1`.
- **Additive:** both `prospects` and `report_recipients` present; `prospects` still
  33 rows, untouched.

**Left to Pedram:** manage the recipient list in-app (Reports view); Phase 5's
Railway/GitHub secrets still needed for real delivery.

**Next:** Phase 6 (optional extras) — NOT started.

## Review — Phase 3 (2026-09-18)
**What changed:** `lib/constants.ts` (enum options/labels matching the current app);
`lib/filters.ts` gained pure `applyControls` (AND-combined search/status/unit/
toured/stage) + `sortRows`; `api.ts` gained `createProspect`/`updateProspect`/
`deleteProspect` + `toInput` (update sends the COMPLETE record because the server
PUT is a full-replace); `ProspectModal` (add/edit, all 11 fields); `Prospects.tsx`
rewritten — sortable headers, combinable filter dropdowns + free-text search,
live result count, inline status `<select>`, add/edit/delete with delete
confirmation, Phase-2 deep-link banner still applied (AND-combined). All writes go
through the Clerk-protected API. No `/server`/schema/table changes.

**How verified:**
- typecheck clean; lint clean (0 warnings); build clean (`✓ 1641 modules`).
- **Filters combine (AND) — verified vs live data:**
  warm ∧ 1 Bedroom = 12 (= manual); follow ∧ toured=no = 14; warm ∧
  toured=scheduled ∧ search"san" = 2; stage "Tour scheduled" ∧ 2 Bedroom = 1.
  All equal the manual intersection.
- **CRUD round-trip + field integrity (real DB, net-zero temp row):**
  count 60 → POST temp row → 61 → PUT changing ONLY status (new→warm) → read-back
  shows status=warm and **all 10 other fields byte-for-byte intact** → DELETE →
  count back to 60. No existing row touched.
- **No field missing:** modal + table cover fname,lname,email,phone,referred,
  responded,status,unitpref,toured,stage,notes (all 11 from the old app).

**Note on the integrity guarantee:** the server PUT replaces `data` wholesale, so
`updateProspect` (and inline status edit) always send the full record via `toInput`
— that is what keeps untouched fields from being blanked.

**Next:** Phase 4 (CSV export) — NOT started.

## Review — Phase 2 (2026-09-18)
**What changed:** new `lib/filters.ts` (tile predicates matching the current app,
`STAGE_ORDER`, `APPLYING_STAGES`, `UNIT_ORDER`, `resolveFilter`). `Dashboard.tsx`
renders 5 status tiles, a unit-preference breakdown, and a leasing-stage bar chart,
all from live API data; every tile/segment is a deep-link into `/prospects?…`.
`Prospects.tsx` reads the URL param via `resolveFilter` and shows a filtered view
with a clear banner (full filter UI remains Phase 3). Landing route is now Dashboard.
Read-only; no `/server`, schema, or data changes.

**How verified:**
- typecheck clean; lint clean (0 warnings); build clean (`✓ 1639 modules`).
- Counts verified against live data (60 rows) with the same predicates:
  - **Tiles:** Total 60 · Responded 22 · Tour sched./done 19 · Need follow-up 28 ·
    Applying/leased 3.
  - **Unit:** Studio 0 · 1 Bedroom 28 · 2 Bedroom 8 · 1BR or 2BR 1 · TBD 3 ·
    Not indicated 20 → sums to 60. ✓
  - **Stage:** Initial outreach 10 · Scheduling 30 · Tour scheduled 10 · Tour
    completed 4 · App in progress 1 · Submitted 1 · Lease signed 1 · Not proceeding 3
    → sums to 60. ✓
  Both breakdowns sum to the total row count — internal consistency confirmed.

**Next:** Phase 3 (Prospects filters/search/inline edit/CRUD) — NOT started.

## Review — Phase 1 (2026-09-18)
**What changed:**
- `/web`: `ClerkProvider` (main.tsx) gates the app — `<SignedOut>` renders only the
  Clerk `<SignIn>`, `<SignedIn>` renders the shell. `react-router-dom` nav shell
  (`AppShell`) with Dashboard / Prospects / Reports; Dashboard & Reports are
  placeholders. `Prospects` reads the LIVE API via `lib/api.ts`, attaching the
  Clerk token (`useAuth().getToken()`) as `Authorization: Bearer`; renders all real
  JSONB fields; 5s polling retained. Types in `lib/types.ts` match live keys.
- `/server`: added `@clerk/express` `clerkMiddleware()` + a `getAuth()`-based `auth`
  guard returning `401 {error:"unauthorized"}` on all four `/api/prospects` routes.
  Health `GET /` stays public. Raw `pg` and the `prospects` table are unchanged
  (`git diff main -- server/server.js` shows only auth additions).

**How verified:**
- `npm run typecheck -w web` clean; `npm run lint -w web` clean (0 warnings);
  `npm run build -w web` clean (`✓ 1638 modules transformed`).
- Signed-out gate: ran `npm run dev -w web`, loaded it — only the Clerk sign-in
  renders, no nav/data (screenshot shared).
- Server auth (local server, local test DB, never prod):
  - `GET /api/prospects` no token → **401** `{"error":"unauthorized"}`
  - `GET` invalid `Authorization: Bearer` → **401**
  - `POST/PUT/DELETE` no token → **401**
  - `GET /` (health) → **200**
- `main` untouched (`75cd4a1`).

**Deferred:** valid-token → 200 curl (needs `CLERK_SECRET_KEY`, which stays with
Pedram). Will be confirmed live after the secret is set in Railway and he signs in.

**Fix during phase:** Clerk `requireAuth()` returned a 302 redirect (browser flow);
replaced with a `getAuth()` guard that returns a proper 401 JSON for an API. Logged
in `lessons.md`.

**Also flagged to Pedram:** Clerk sign-ups are still open — restrict to team emails
(allowlist / Organizations) in the Clerk dashboard before sharing.

**Next:** Phase 2 (Dashboard) — NOT started.

## Review — Phase 0 (2026-09-18)
**What changed:** added root `package.json` (workspaces server+web), scaffolded a
blank `/web` (Vite + React + TS + Tailwind + shadcn/ui config), `.env.example` for
both workspaces, `tasks/todo.md` + `tasks/lessons.md`, `.gitignore` updated for
`dist/` and `.env.local`. `/server` code untouched (only added `server/.env.example`).
`/public` left in place. All work on branch `rebuild`.

**Definition of Done — verified:**
- `npm install` at root: OK (both workspaces).
- `npm run build -w web`: clean (`✓ built in ~0.5s`).
- `npm run typecheck -w web`: clean. `npm run lint -w web`: clean (0 warnings).
- `/server`: `node --check server.js` OK; `git diff main -- server/server.js` empty
  (behavior identical to main).
- `main` untouched (`75cd4a1`), still deploying the current live app.
- No database access of any kind. Backups exist off-Railway (JSON + restore .sql).

**Fix during phase:** `tailwind.config.js` used `require()` in an ESM package →
`ReferenceError`. Switched to `import animate from "tailwindcss-animate"`. Logged
in `lessons.md`.

**Next:** Phase 1 (Clerk on web + server-side token verification + port the live
table) — NOT started; awaiting go-ahead.
