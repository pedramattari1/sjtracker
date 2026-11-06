# Nurture & Two-Way Messaging

Spec: `docs/nurture-spec.md`. Build-on-these facts in the spec header.

---

# Phase 3 — Inbox power features  ✅ built, awaiting review

Scope (§10 Phase 3 / §6). Bulk **suppress**→Phase 4, bulk **enroll**→Phase 5
(approved deferral); Phase 3 bulk bar = status / tag / snooze / clear. Enrollment
sidebar panel is a read-only placeholder until Phase 5.

## Checklist
- [x] `server/lib/prospectCrm.js` — `prospect_crm` table (FK text) + get/upsert + pure `computeReengageAt` (~60d before target; next_year/later only) + `test/prospectCrm.test.js` (ALL PASS)
- [x] `server/lib/snippets.js` — `snippets` table + CRUD
- [x] `server/lib/conversations.js` — `setTag`, `setSnooze`, `countUnread` (excludes future-snoozed), `bulkUpdate`
- [x] `server/server.js` — ensureTable; PATCH extended (tag, snoozed_until/snooze_note, clears → events); `POST /api/conversations/bulk`; `GET …/unread-count`; `GET/PUT /api/prospects/:id/crm`; `GET/POST/DELETE /api/snippets`
- [x] `web/src/lib/types.ts` — `ProspectCrm`, `Snippet`
- [x] `web/src/lib/api.ts` — tag/snooze PATCH, bulk, unread-count, CRM get/put, snippets CRUD
- [x] `web/src/lib/convoBadges.ts` — `TIMEFRAME_OPTIONS`
- [x] `web/src/components/SnoozeMenu.tsx` — quick picks + custom date + clear (shared)
- [x] `web/src/components/BulkActionBar.tsx` — set status / tag / snooze / clear
- [x] `web/src/components/ProspectSidebar.tsx` — facts + timeframe (→ reengage), tag buttons, snooze state, status, enrollment placeholder
- [x] `web/src/components/ConversationList.tsx` — multi-select checkboxes; future-snoozed hidden from active views (Snoozed filter shows them)
- [x] `web/src/components/ThreadView.tsx` — quick-tag buttons, snooze control, snippet insert/new/delete, Details (sidebar) toggle
- [x] `web/src/pages/Messaging.tsx` — three-pane (list | thread | sidebar; sidebar is a drawer on mobile) + selection state + bulk bar
- [x] `web/src/components/AppShell.tsx` — unread badge on Messaging nav (polls count ~20s)

## Review (results)
- `node --check` all; `node test/prospectCrm.test.js` **ALL PASS**; cryptoBox/quoted/mime still PASS (all in `npm test` chain)
- web `tsc` / `eslint src` clean; `vite build` succeeds
- Not run (needs live Clerk + API + DB — you drive): snooze leaves/returns active; set tag; timeframe → reengage date; snippet insert/add/delete; nav badge; bulk status/tag/snooze.
- Guardrails: additive `prospect_crm` + `snippets` only; `prospects` JSONB untouched; no new env vars; sends unchanged (thread-bound/Gmail-only).

### Deferred
- **Phase 4:** `suppressions` table + bulk suppress + send/enroll enforcement + the 40% promo / templates / pre-flight / first blast.
- **Phase 5:** sequence engine → bulk enroll + the sidebar enrollment/next-send data (placeholder now).

---

# Phase 2b — Attachments + status affordance  ✅ built, awaiting review

Attachments (send + view inbound) deferred from Phase 2, plus a thread-header
status-control affordance fix. Approved cap: **~15 MB** outbound binary (keeps
the base64-encoded message under Gmail's 25 MB limit); inbound uncapped.

## Checklist
- [x] `server/lib/messageAttachments.js` — `message_attachments` table + insert / listByMessageIds / getForDownload / setGmailAttachmentId
- [x] `server/lib/google.js` — `buildMime` wraps in `multipart/mixed` when attachments present; `attachmentGet`; pure `extractAttachments`
- [x] `server/lib/gmailSync.js` — store inbound attachment metadata during sync (no cap)
- [x] `server/server.js` —
  - global `express.json()` keeps the 100kb default but **skips** `POST /api/messages/send`, which gets route-scoped `express.json({limit:'30mb'})`
  - send accepts `attachments[]` (base64), enforces the **15 MB** cap (`413 attachment_too_large`), surfaces Gmail oversize errors clearly, persists metadata, and best-effort captures sent attachment ids for download
  - `GET …/messages` includes each message's `attachments`
  - `GET /api/attachments/:attId` — Clerk-gated proxy streaming Gmail bytes
- [x] `server/test/mime.test.js` — multipart/mixed + base64 part + threading + `extractAttachments` (DB-free); added to `npm test` chain (now cryptoBox + quoted + mime + reportRuns)
- [x] `web/src/lib/types.ts` — `MessageAttachment`; `Message.attachments`
- [x] `web/src/lib/files.ts` — `fileToBase64`, `formatBytes`, `MAX_ATTACH_BYTES` (15 MB)
- [x] `web/src/lib/api.ts` — `SendMessageInput.attachments`; `downloadAttachment` (token-fetch → blob)
- [x] `web/src/components/ThreadView.tsx` —
  - composer: Attach button + selected-files list (name/size/remove) + running total w/ 15 MB guard; reads files → base64 on send
  - bubbles: attachment chips with download (paperclip + size)
  - status control: bordered button + `ChevronDown` so it reads as a dropdown

## Review (results)
- `node --check` all; `node test/mime.test.js` **ALL PASS**; cryptoBox + quoted still PASS
- web `tsc` / `eslint src` clean; `vite build` succeeds
- Not run (needs live Clerk + API + Gmail — you drive): send with a file, open an inbound attachment, the 15 MB client+server guard, Gmail oversize path, outbound-attachment download.
- Guardrails: additive `message_attachments` only; `prospects` untouched; sends stay thread-bound/Gmail-only; the raised JSON limit is **route-scoped to send**, not global.

### Notes / deferred
- Outbound attachment download depends on the post-send id capture (best effort); if Gmail returns the sent parts, it works; otherwise the chip still shows but download may 409 (`attachment_not_fetchable`).
- Phase 3 unchanged: snooze, set reply tags, prospect-facts sidebar, snippets, nav badge, bulk actions.

---

# Phase 2 — Conversations inbox (core)  ✅ built, awaiting review

Scope (§10 Phase 2) + three fold-ins. Attachments **deferred to 2b** (approved).
Snooze, reply-tag *setting*, prospect-facts sidebar, snippets, nav badge, bulk
actions stay **Phase 3** (we display tag/snooze state now, don't set them).

## Checklist
- [x] `server/lib/quoted.js` — server-side quoted-history split (`{visible, quoted}`) + `test/quoted.test.js` (ALL PASS)
- [x] `server/lib/conversationNotes.js` — `conversation_notes` table + CRUD
- [x] `server/lib/conversationEvents.js` — `conversation_events` activity log
- [x] `server/lib/conversations.js` — `setStatus`, `markRead`, `getWithProspect`; list enriched w/ last snippet + prospect name
- [x] `server/server.js` — ensureTable wiring; routes: `PATCH /api/conversations/:id` (status + mark-read, logs event), notes CRUD, `GET …/events`, messages augmented w/ `body_visible`/`body_quoted`; `send` now accepts `conversationId` (reply into thread)
- [x] `web/src/lib/types.ts` — `ConversationNote`, `ConversationEvent`, `ConversationStatus`; `Message` + visible/quoted; `Conversation` + lname/snippet
- [x] `web/src/lib/api.ts` — status/mark-read, notes CRUD, events, `sendMessage(conversationId)`
- [x] `web/src/lib/time.ts` — **local-timezone** formatters (relative + absolute)
- [x] `web/src/lib/convoBadges.ts` — conversation status + tag pills/options
- [x] `web/src/components/Avatar.tsx` — initials avatar
- [x] `web/src/components/ConversationList.tsx` — name + snippet + avatar + unread/status/tag chips + filters (All/Unread/Snoozed/Engaged/status/tag) + search
- [x] `web/src/components/ThreadView.tsx` — header + status dropdown + prospect link; bubbles (outbound right/inbound left, **local** timestamps, **quoted collapsed** w/ expander); reply composer (thread's account); Notes tab; Activity timeline
- [x] `web/src/pages/Messaging.tsx` — responsive two-pane shell (desktop split; mobile list→thread w/ back); account header + Connect + Sync now

## Fold-ins (all in)
- [x] Quoted reply history stripped server-side; bubble shows new content only, "Show quoted text" reveals the rest.
- [x] All timestamps render in the viewer's local timezone (never UTC).
- [x] Thread list shows name + snippet + avatar + unread/status/tag chips + §6 filters + search (not raw subject).

## Review (results)
- `node --check` all new/edited server files — OK
- `node test/quoted.test.js` — **ALL PASS**; `cryptoBox` still PASS
- web `tsc --noEmit` clean; `eslint src` clean; `vite build` succeeds (1650 modules)
- Not run (needs live Clerk + API + DB — you drive): in-app render of the two-pane, real reply round-trip, status/notes/timeline against Postgres.
- Guardrails: all new tables additive (`conversation_notes`, `conversation_events`); `prospects` untouched; replies stay thread-bound to the conversation's account (Gmail-only); dedupe/threading preserved; report feature + its test untouched.

### Deferred
- **Phase 2b (attachments):** inbound metadata + Gmail bytes proxy + outbound multipart MIME. When built, raise the JSON body limit **on the send route only** (`express.json({limit:'30mb'})`), not globally. Proposed separately.
- Phase 3: snooze, set reply tags, prospect-facts right sidebar, snippets, nav unread badge, bulk actions.

---

# Phase 1 — Email plumbing (one account)  ✅ shipped (live test passed)

Spec: §10 Phase 1.

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
