# L.I.V.E. SJ — Prospect Tracker

Internal prospect tracker for the City of San José subsidy program (The Fay).
Clerk-gated dashboard app. npm workspaces monorepo:

- **`web/`** — React + Vite + TypeScript + Tailwind frontend → deploy on **Vercel** (root dir `web`)
- **`server/`** — Express + Postgres API (Clerk-protected) → deploy on **Railway** (root dir `server`)

Data lives in Postgres on Railway (`prospects` + `report_recipients` tables). The
Prospects view polls the API every 5s so edits sync across the team.

---

## Deploy

### Railway — API + database (root dir `server`)
1. New Project → Deploy from GitHub repo → this repo; **Settings → Root Directory = `server`**.
2. **+ New → Database → PostgreSQL**, then on the service add a Variable **Reference**
   to `DATABASE_URL`.
3. Set env vars: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and (for the report)
   `RESEND_API_KEY`, `RESEND_FROM`, `CRON_SECRET`. See `server/.env.example`.
4. **Settings → Networking → Generate Domain**. Visit it → `{"ok":true,...}`.
   Tables auto-create; prospects seed on first boot.

> If logs show an SSL error, set `DATABASE_SSL=true` and redeploy.

### Vercel — frontend (root dir `web`)
1. Import the repo; **Root Directory = `web`**.
2. Env vars: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL` (the Railway URL).
   See `web/.env.example`.
3. Deploy → share the Vercel link with the team.

### Scheduled city report
`.github/workflows/city-report.yml` POSTs to `/api/reports/city-export` weekly
(Mondays 15:00 UTC) and on manual dispatch. Add repo secrets `API_BASE_URL` and
`CRON_SECRET`. Recipients are managed in-app on the Reports page.

---

## Run locally
```bash
npm install                 # root, installs both workspaces
npm run dev -w server       # API (needs DATABASE_URL + Clerk keys in env)
npm run dev -w web          # frontend (VITE_* in web/.env.local)
```
Checks: `npm run typecheck -w web`, `npm run lint -w web`, `npm run build -w web`.

## Notes
- Access is Clerk-gated; restrict sign-ups to team emails in the Clerk dashboard.
- The `prospects` table is production data — schema changes are additive only.
- To change seeded starting data, edit the `SEED` array in `server/server.js`
  (only used when the table is empty).
