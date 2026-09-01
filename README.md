# L.I.V.E. SJ — Prospect Tracker

Shared, editable prospect tracker for the internal team. No sign-in.

- **`server/`** — Express + Postgres API → deploy on **Railway**
- **`public/`** — the tracker web page → deploy on **Vercel**

Data lives in Postgres (on Railway). Everyone who opens the Vercel link can
view and edit; the page polls the API every 5 seconds so edits sync.

---

## Deploy — one time, ~10 minutes

### 1. Push to GitHub
Already done if you cloned/pushed this repo. Otherwise, from this folder:
```bash
git init && git add -A && git commit -m "Initial commit"
gh repo create sj-tracker --private --source=. --push
```

### 2. Railway — API + database
1. https://railway.app → **New Project** → **Deploy from GitHub repo** → pick `sj-tracker`.
2. In the service **Settings → Root Directory**, set it to `server`.
3. In the project, **+ New → Database → Add PostgreSQL**.
4. Open your **service → Variables → + New Variable → Add Reference** and pick
   `DATABASE_URL` from the Postgres service. (This wires the app to the DB.)
5. Railway builds and starts it. Under **Settings → Networking**, click
   **Generate Domain**. Copy that URL — e.g.
   `https://sj-tracker-production.up.railway.app`.
6. Visit that URL in a browser; you should see `{"ok":true,...}`. The table
   auto-creates and seeds the starting prospects on first boot.

> If the logs show an SSL connection error, add a variable
> `DATABASE_SSL=true` to the service and redeploy.

### 3. Point the frontend at the API
In **`public/index.html`**, set the config line near the top of the script:
```js
var API_BASE = 'https://YOUR-RAILWAY-URL';   // no trailing slash
```
Commit and push.

### 4. Vercel — the page
1. https://vercel.com → **Add New → Project** → import `sj-tracker`.
2. **Root Directory:** `public`. Framework preset: **Other**. No build command.
3. **Deploy.** You get a link like `https://sj-tracker.vercel.app`.

Send that Vercel link to the team. Done.

---

## Run locally (optional)
```bash
cd server
npm install
DATABASE_URL=postgres://... npm start   # needs a Postgres to point at
```
Then open `public/index.html` with `API_BASE` set to `http://localhost:3000`.

## Notes
- **No auth by design** — anyone with the link and the API URL can edit. Keep
  the links internal. A shared password gate can be added later if needed.
- To change the seeded starting data, edit the `SEED` array in
  `server/server.js` (only used when the table is empty).
