# Nurture & Two-Way Messaging — Phase 1 (Email plumbing, one account)

Spec: `docs/nurture-spec.md` §10 Phase 1. Build-on-these facts in the spec header.

## Plan (approved, with 3 adjustments)
Adjustments baked in:
1. Seed `last_history_id` from `users.getProfile` at connect time (callback).
2. OAuth state HMAC uses `UNSUBSCRIBE_SECRET` (encryption key stays for tokens only).
3. `TOKEN_ENCRYPTION_KEY` decoded as **hex** → 32 bytes.
Worker: **in-process** poll + routes (option 1).

## Checklist
- [x] `server/lib/cryptoBox.js` — AES-256-GCM (hex key) + HMAC OAuth state
- [x] `server/lib/google.js` — OAuth code flow, token refresh, MIME w/ threading, send, History API, message parse (native fetch, no googleapis)
- [x] `server/lib/emailAccounts.js` — `email_accounts` table + CRUD (encrypted token, history baseline)
- [x] `server/lib/conversations.js` — `conversations` table + thread binding / inbound-reply flip
- [x] `server/lib/messages.js` — `messages` table (UNIQUE `gmail_message_id` idempotency)
- [x] `server/lib/gmailSync.js` — inbound engine (history deltas → store → unread/engaged) + 90s in-process poll
- [x] `server/server.js` — guarded dotenv; `initDb` ensureTable calls + prospects email index; start poll; Phase-1 routes
- [x] `server/.env.example` — new Google/crypto/app env vars
- [x] `server/package.json` — dotenv devDep; test script runs cryptoBox
- [x] `server/test/cryptoBox.test.js` — encrypt/decrypt + tamper + state sign/verify/expiry (DB-free)
- [x] `web/src/lib/types.ts` — `EmailAccount`, `Conversation`, `Message`
- [x] `web/src/lib/api.ts` — accounts / OAuth start / conversations / messages / send / sync
- [x] `web/src/pages/Messaging.tsx` — connect, test send, sync, thread view (bare; Phase 2 replaces)
- [x] `web/src/App.tsx` + `AppShell.tsx` — `/messaging` route + nav (Mail icon)

## Routes added (all Clerk-gated except the callback)
- `GET  /api/oauth/google/start`    → signed consent URL
- `GET  /api/oauth/google/callback` → **public**, state-verified; exchange code, seed historyId, store encrypted token, redirect to APP_BASE_URL
- `GET  /api/email-accounts`        → connected accounts (no tokens)
- `GET  /api/conversations`
- `GET  /api/conversations/:id/messages`
- `POST /api/messages/send`         → thread-bound Gmail send + persist
- `POST /api/sync/run`              → immediate inbound sync

## Verification (how to prove it)
1. Deploy/run with env set → **Messaging** → **Connect Gmail** → consent as `pattari@flow.life` → redirected back, account shows connected.
2. Send a test to an address you control → arrives, lands in real **Sent**, shows as outbound in-app.
3. Reply → **Sync now** → reply appears in the thread, conversation flips **unread + engaged**, still visible in real Gmail (same thread).

## Review (results)
- Local checks that don't need secrets/DB all pass:
  - `node --check` on all new/edited server files — OK
  - `node test/cryptoBox.test.js` — **ALL PASS** (round-trip, tamper, key-length, state sign/verify/expiry)
  - `web`: `tsc --noEmit` clean; `eslint` on changed files clean
- Not yet run (needs live creds / DB — you drive this):
  - the live OAuth consent + send/reply round-trip (Phase 1 acceptance)
  - server boot against real Postgres (ensureTable additive migrations)
- Guardrails honored: Gmail-only for prospect mail; all FKs to `prospects` are `text`; additive `ensureTable` only (prospects never altered); existing report feature + `reportRuns` test untouched; threading headers on every send; dedupe by `gmail_message_id`; `enterprise-dashboard`/Sheets untouched.

### Deferred (clearly marked TODOs, not silent skips) → later phases
- Pausing the active sequence enrollment on reply, and `suppressions` + stop-on-bounce (Phase 5; no enrollments/suppressions tables in Phase 1). Inbound bounces ARE flagged `is_bounce`.
- Attachments, full two-pane inbox, status/notes/timeline (Phase 2).
