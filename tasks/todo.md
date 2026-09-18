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
