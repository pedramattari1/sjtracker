# L.I.V.E. SJ Tracker — Nurture & Two-Way Messaging Feature Spec

**Repo:** github.com/pedramattari1/sjtracker
**Stack (existing):** Frontend React/Vite/Tailwind + shadcn-style (CVA/clsx/tailwind-merge/lucide) + Clerk (Vercel) · API Node/Express + raw `pg` + Postgres (Railway) · npm workspaces (`server`, `web`)
**New services:** Gmail API (OAuth, user-consent) · a worker loop for the scheduler + inbound sync

> **Confirmed against the repo (2026-11-05) — build on these, don't re-guess:**
> - `prospects` table: **`id TEXT PRIMARY KEY`**, `ord DOUBLE PRECISION`, `data JSONB`. **All foreign keys to prospects must be `text`, not int.**
> - Prospect JSONB keys: `fname, lname, email, phone, referred, responded, status, unitpref, toured, stage, notes`. **First name = `data->>'fname'`; email = `data->>'email'`.** The prospect's own `status` (new/warm/follow/none) and `stage` (free text) already exist — leave them alone; the new conversation status is a separate column.
> - **No migration runner.** House pattern: a `server/lib/<feature>.js` module that exports `ensureTable(pool)` with `CREATE TABLE IF NOT EXISTS`, called additively from `initDb()` in `server.js` (see `lib/recipients.js`, `lib/reportRuns.js`). Follow this exactly.
> - IDs: existing tables use **text ids with prefixes** (`p_…`, `r_…`, `seed_N`) via a `newId()` helper. New tables may use `uuid DEFAULT gen_random_uuid()` **or** the text-prefix helper — pick one and be consistent; FKs to `prospects` stay `text` regardless. (`gen_random_uuid()` is core in Postgres 13+, which Railway uses; if a migration errors on it, `CREATE EXTENSION IF NOT EXISTS pgcrypto;` in the same `ensureTable`, or fall back to the text-id helper.)
> - Config: plain `process.env.*`, **no dotenv** in `server.js`. Railway injects vars. For local worker/API testing, either add `dotenv` or export vars in the shell.
> - Routes live inline in `server.js`, Clerk-gated via the `auth` middleware (`getAuth` → 401 JSON if no `userId`). The health route `GET /` is public; the Resend city-report route uses a `CRON_SECRET` guard, not Clerk.
> - `node-cron` is already a dependency and already schedules the weekly report **in-process** inside `server.js`.
> - Gmail OAuth app lives in Cloud project **flow-23225** (shared Flow project; an unrelated `enterprise-dashboard` service account + Sheets setup already exists there — **do not touch it**). Our method is **user-consent OAuth only**, no service account, no domain-wide delegation.

---

## 1. Goal

Turn the static prospect list (~140 people) into a managed nurture pipeline:

- **Two-way messaging inside the app.** Sending an in-app message delivers as a real email **from a work Gmail account**. When the prospect replies, the reply appears **both in the app and in that account's normal Gmail inbox** (same thread).
- **Shared inbox, thread-bound sending.** No assignment/ownership model. Two accounts connect (starting with `pattari@flow.life`; a second leasing member added before the blast); **a conversation is bound to the account that started it, and every reply in that thread sends from that same account** — so the prospect always corresponds with one consistent address. Both users see and act on every thread.
- **Automated nurture sequence** (3 emails, 0/4/9 days) that **stops the instant a prospect replies** and hands the conversation to a human.
- **Next-year prospects are parked and auto-re-engaged**, not dropped.
- New, clean UI (Tailwind + existing shadcn-style components), **mobile-friendly**: a Conversations inbox and a Campaigns view.

Emails must **not** come from wimmops.com (that's the Resend city-report sender). Prospect mail comes only from the connected work Gmail accounts.

---

## 2. Email architecture — Gmail API (not Resend)

Resend stays for the existing weekly city CSV report. All **prospect** mail uses the **Gmail API** so messages are genuinely from the work address, land in the real Sent folder, are DMARC-aligned by Google, and replies return naturally to the real inbox while the app syncs the same messages.

### 2.1 Accounts & thread binding
Google Workspace accounts connected via user-consent OAuth. Each conversation stores `email_account_id` = the account that originated the thread. **All sends in a conversation (manual replies and sequence steps) use that account.** The composer never offers a choice of sender; it uses the thread's account. No `assigned` field, no per-user filters.

### 2.2 OAuth
- OAuth 2.0 Authorization Code flow, per account. Internal app under project **flow-23225**.
- Scopes: `gmail.send`, `gmail.readonly` (use `gmail.modify` only if we later want to label synced mail).
- **Audience = Internal** → no Google verification review required.
- Store the **refresh token encrypted** (`TOKEN_ENCRYPTION_KEY`, AES-256-GCM). Refresh access tokens on demand.
- Redirect URI: `APP_BASE_URL/api/oauth/google/callback` (API/Railway origin).

### 2.3 Sending
- Build an RFC 822 MIME message and call `users.messages.send`.
- First outbound in a conversation creates the Gmail thread → persist `gmail_thread_id`, the returned `gmail_message_id`, and the generated `Message-ID`.
- Follow-ups pass `threadId` and set `In-Reply-To` + `References` to the last message's `Message-ID` so everything threads.
- **Attachments:** outbound composer supports file attachments → multipart MIME. Cap total size (e.g. 20 MB).
- **Throttle:** cap sends per account per minute (default 10/min).

### 2.4 Receiving replies (inbound sync)
- **MVP = polling** per account every 90s via the Gmail **History API**: store `last_history_id` per account, pull deltas, fetch new bodies.
- Match inbound to a conversation by `gmail_thread_id`.
  - Match → insert inbound `message`, set `unread=true`, conversation `status='engaged'`, update `last_message_at`; **pause the active enrollment** (`status='paused'`, `paused_reason='replied'`); clear any snooze.
  - `from mailer-daemon` / DSN bounce → mark `is_bounce=true`, add email to `suppressions`, **stop** the enrollment.
  - No thread match → ignore (optionally an "Unmatched" bucket, Phase 6).
- **Inbound attachments:** store attachment metadata (`message_attachments`); fetch bytes on demand via `attachments.get`.
- **Idempotency:** `gmail_message_id` UNIQUE; skip anything already stored.
- **Phase 6 upgrade:** replace polling with Gmail `watch` → Pub/Sub push.

### 2.5 Open tracking (optional, Phase 6)
Gmail API gives no opens. Optional 1×1 pixel → app endpoint; approximate and can dent deliverability. **Reply is the signal that drives the nurturer.**

---

## 3. Nurture sequence logic

### 3.1 Main sequence (editable in Campaigns)
| Step | When | Purpose |
|---|---|---|
| Email 1 | Day 0 | 40% promo re-engagement; ask move-in timeframe (this year / next year); gauge interest |
| Email 2 | Day 4 (if no reply) | Short nudge, lead with the deadline |
| Email 3 | Day 9 (if no reply) | "Breakup" / last call |

### 3.2 Hard rules
- **Any reply immediately pauses the enrollment** and routes the conversation to the inbox. Automation never emails someone mid-conversation.
- After Email 3 with no reply → conversation status `Dormant`, enrollment `completed` (**unless** timeframe = next_year/later → see §3.3).
- Suppressed (unsubscribed/bounced) prospects are skipped and never re-enrolled.
- Sends respect a **business-hours window** (default 9:00–17:00 America/Los_Angeles, Mon–Fri). Out-of-window steps reschedule to the next window start.

### 3.3 Timeframe capture + next-year re-engagement
- When a human reads a reply (or sets it in the thread sidebar), they record **timeframe** on the prospect: `this_year | next_year | later | unknown`, plus optional `target_move_month`.
- `next_year`/`later` → set `prospect_crm.reengage_at` ≈ **60 days before** the target window (default target = Q1 next year if only "next year" is known). The prospect does **not** go Dormant.
- A **"Future" sequence** (lighter re-intro template) exists; the worker's daily job auto-enrolls prospects whose `reengage_at <= now` and who aren't already engaged/suppressed.

### 3.4 Snooze & tags affect surfacing
- **Snooze:** `conversations.snoozed_until` hides a thread from the active list until due, then it resurfaces unread at the top (follow-up reminder = same mechanic).
- **Reply tag:** one-click per-thread intent tag — `interested | not_interested | timing | needs_info` — drives filters and reporting.

**Conversation statuses (separate from the prospect's own `status`/`stage`):** `New → Contacted → Engaged → (Interested | Future | Not Interested) → Toured → (Leased | Lost | Dormant)`.

---

## 4. Data model (Postgres, additive `ensureTable` modules)

Existing `prospects (id TEXT, ord, data JSONB)` untouched. Add an index on `((data->>'email'))`. Each table below ships as a `server/lib/<name>.js` module with `ensureTable(pool)`, called from `initDb()`.

```sql
email_accounts (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text, email text unique, provider text default 'gmail',
  display_name text, refresh_token_encrypted text, last_history_id text,
  status text default 'active', created_at timestamptz default now()
)

prospect_crm (  -- side table; prospects stays untouched
  prospect_id text primary key references prospects(id),
  timeframe text,          -- this_year | next_year | later | unknown
  target_move_month text,  -- 'YYYY-MM'
  reengage_at timestamptz,
  unit_interest text, budget text, source text,
  updated_at timestamptz default now()
)

conversations (
  id uuid primary key default gen_random_uuid(),
  prospect_id text references prospects(id),
  email_account_id uuid references email_accounts(id),  -- thread-bound sender
  gmail_thread_id text, subject text, status text default 'contacted',
  tag text,                 -- interested | not_interested | timing | needs_info
  unread bool default false, snoozed_until timestamptz, snooze_note text,
  last_message_at timestamptz, created_at timestamptz default now(),
  unique (prospect_id, email_account_id)
)

messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id),
  direction text check (direction in ('outbound','inbound')),
  gmail_message_id text unique, gmail_thread_id text, rfc822_message_id text,
  from_email text, to_email text, subject text,
  body_html text, body_text text, snippet text,
  is_bounce bool default false,
  sent_at timestamptz, received_at timestamptz, created_at timestamptz default now()
)

message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id),
  filename text, mime_type text, size_bytes int,
  gmail_attachment_id text, storage_ref text, direction text
)

snippets ( id uuid primary key default gen_random_uuid(), name text, body_text text, created_by text, created_at timestamptz default now() )

templates (
  id uuid primary key default gen_random_uuid(),
  name text, subject text, body_html text, body_text text,
  is_active bool default true, created_at timestamptz default now(), updated_at timestamptz default now()
)

sequences ( id uuid primary key default gen_random_uuid(), name text, is_active bool default true, created_at timestamptz default now() )

sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references sequences(id),
  step_number int, template_id uuid references templates(id), delay_days int
)

sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  prospect_id text references prospects(id),
  sequence_id uuid references sequences(id),
  email_account_id uuid references email_accounts(id),
  conversation_id uuid references conversations(id),
  current_step int default 1,
  status text default 'active' check (status in ('active','paused','completed','stopped')),
  next_send_at timestamptz, paused_reason text,
  enrolled_at timestamptz default now(),
  unique (prospect_id, sequence_id)
)

suppressions (
  id uuid primary key default gen_random_uuid(), email text unique,
  reason text check (reason in ('unsubscribe','bounce','manual')), created_at timestamptz default now()
)

email_events (  -- optional analytics (Phase 6)
  id uuid primary key default gen_random_uuid(), message_id uuid references messages(id),
  type text check (type in ('sent','open','reply','bounce')), occurred_at timestamptz default now()
)
```

---

## 5. The engines (worker)

Inbound sync + scheduled sends need a loop. The repo already runs `node-cron` **in-process** in `server.js` (the weekly report). Two options, pick in the Phase-5 plan:
- **(Recommended) a separate Railway worker service** off the same repo (`node server/worker.js`), so sends/polling don't depend on web traffic and a web restart doesn't drop a poll cycle.
- **In-process** `node-cron` alongside the existing report scheduler — simplest, matches current pattern, but couples the loop to the web dyno.

**Send loop (every 1 min):** select `active` enrollments with `next_send_at <= now`; skip suppressed; respect send window; render template + compliance footer; send via the enrollment's Gmail account (thread headers if the conversation exists); upsert conversation + insert outbound message; advance step or `completed`; respect per-account throttle.

**Inbound loop (every 90s/account):** per §2.4 — store replies, pause enrollment, flag unread/engaged, clear snooze, handle bounces.

**Daily jobs:**
- **Re-engage:** enroll prospects with `reengage_at <= now` (and not engaged/suppressed) into the Future sequence (§3.3).
- **Snooze resurfacing:** threads whose `snoozed_until <= now` return to the active list unread.
- **Optional digest (Phase 6):** one email to the two users summarizing new replies, due snoozes, due re-engagements.

**Blast pacing:** the first send to 140 is spread (default **~50/day over ~3 days**, optionally split across both accounts) via staggered `next_send_at` on step 1 — never one burst. All loops idempotent via UNIQUE `gmail_message_id`.

---

## 6. Pages / UI (Tailwind + existing component style, mobile-responsive)

Add **Conversations** and **Campaigns** to the nav (react-router + Clerk gate, matching existing pages). Nav shows an **unread conversations badge**.

1. **Conversations (Inbox)** — two-pane on desktop, single-pane (list→thread) on mobile. Left: thread list (initials avatar, name, snippet, time, unread dot, status + tag chips) + filters (All / Unread / Snoozed / Engaged / by status / by tag) + search. **Bulk actions** via multi-select: set status, set tag, suppress, enroll. Right: thread view.
2. **Thread view** — header (name, email, **status dropdown**, link to prospect detail; sender address shown, not editable); message list (outbound right, inbound left, timestamps, **attachments shown/downloadable**); **reply composer** (sends from the thread's account, **insert template / insert snippet, attach files**); **Pause/Resume sequence**, **Snooze** (date/quick picks), **quick tag** buttons; **Notes** tab; **activity timeline**.
   - **Right sidebar:** prospect facts (unit interest, budget, **timeframe**, source — editable; setting next_year/later sets re-engage), enrollment status + current step + **"next send: Fri 9:05am"**, tag, snooze state, quick status buttons.
3. **Campaigns** — main + Future sequence cards with steps and per-step counts (active / replied / completed / bounced); enrollment table; pause/resume; **Enroll prospects** button.
4. **Enroll modal** — multi-select prospects (with filters) → choose sending account(s) + sequence → **pre-flight readiness summary** (valid emails / missing email / **duplicates deduped** / already suppressed, with excluded counts) → confirm. Applies blast pacing (§5).
5. **Templates** — list + editor (subject, body, merge-field insert, live preview with sample prospect, auto compliance footer). Seed main + Future templates (§8).
6. **Snippets** — small manager for canned one-off replies.

---

## 7. Compliance (CAN-SPAM)

Every sequence email auto-appends: company name, **physical mailing address** (Flow San Jose, 10 E. Reed St., San Jose, CA `<CONFIRM ZIP>`), and a **tokenized unsubscribe link**. Honest subjects.

- `GET /unsubscribe?token=<signed>` → add to `suppressions`, confirmation page. Token signed with `UNSUBSCRIBE_SECRET`. (Public route, no Clerk gate — like the city-report route.)
- Suppressed emails excluded from all sends and enrollment.

---

## 8. Email copy (drafts — finalize later; merge fields `{{first_name}}` = `data->>'fname'`, `{{sender_name}}`)

**Email 1 — Day 0** · Subject: *Your move-in savings just went up — now up to 40% off at Flow San Jose*
> Hi {{first_name}},
>
> Quick update worth a look: the L.I.V.E. San José move-in offer just increased. We've added **8 weeks free**, bringing total savings up to **40% off** — up from the 25% we had before.
>
> Limited-time offer. Even if you're planning a move later this year or sometime in 2027, it's worth locking in now.
>
> Are you thinking **this year or next year**? Reply with your timeframe and I'll send current availability and what the 40% looks like on your unit of interest.
>
> Best,
> {{sender_name}} — Flow San Jose, Leasing

**Email 2 — Day 4 (no reply)** · Subject: *Quick follow-up on your 40% move-in offer*
> Hi {{first_name}}, just making sure this reached you — the 40% L.I.V.E. San José offer (8 weeks free) is limited-time. If you're considering a move this year or next, reply with your timeframe and I'll pull current options.

**Email 3 — Day 9 (no reply)** · Subject: *Should I close out your file?*
> Hi {{first_name}}, I don't want to keep filling your inbox. If this isn't on your radar right now, just say so and I'll close your file. If the 40% offer still interests you, reply and I'll jump on it before it ends.

**Future sequence — re-intro** · Subject: *Your move-in window is coming up*
> Hi {{first_name}}, you'd mentioned a move around {{target_move_month}} — just reconnecting as that gets closer. Current L.I.V.E. San José offers and availability are worth a look; reply and I'll send what fits your timeframe.

---

## 9. Setup status (Phase 0)

- ✅ Cloud project **flow-23225** (Owner access granted); Gmail API enabled; Internal consent screen + scopes; Web OAuth client created.
- ✅ Railway env set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, `UNSUBSCRIBE_SECRET`, `APP_BASE_URL`. (Clerk + `DATABASE_URL` + Resend stay.)
- ⏳ Still needed before the blast (Phase 4): physical mailing address **ZIP**; promo **end date**; the **second** leasing Gmail; confirm **DKIM** on the Workspace domain.
- First connected account: `pattari@flow.life`.

---

## 10. Build phases + acceptance criteria

**Phase 1 — Email plumbing (one account).** OAuth connect (encrypted token in `email_accounts`); Gmail API send with threading; polled inbound sync stores a reply, matches the conversation, flips it unread/engaged — and the reply is also visible in real Gmail.

**Phase 2 — Conversations inbox (core).** Thread list + thread view + reply composer (sends from thread account) + attachments (send + view inbound) + status + notes + activity timeline; mobile-responsive two-pane. Full manual two-way messaging.

**Phase 3 — Inbox power features.** Snooze / follow-up reminders; reply tags; thread right-sidebar (prospect facts + timeframe + enrollment/next-send); canned-reply snippets; unread nav badge + in-app new-reply indicator; bulk actions.

**Phase 4 — Templates + 40% promo + pre-flight + bulk enroll + first blast.** Template editor (merge/preview/footer) + seeded templates; connect the **second** account; enroll modal with pre-flight readiness + dedupe; spread the 140 over ~3 days; send Email 1.

**Phase 5 — Nurturer automation.** Worker send + inbound loops; Email 2/3 on schedule within business hours; **reply pauses enrollment**; timeframe → **next-year Future re-engagement**; no-reply-after-3 → Dormant; unsubscribe + bounce suppression; snooze resurfacing.

**Phase 6 — Dashboard + polish.** Per-step analytics; optional open pixel; optional Gmail `watch`/Pub-Sub; optional daily digest; unmatched-inbound bucket; styling pass.

---

## 11. Guardrails (do not violate)

- Prospect mail is **Gmail API only**, never wimmops.com/Resend.
- **Replies in a thread always send from that thread's bound account** — never a different address.
- A **reply always pauses** the sequence before any further automated send.
- `next_year`/`later` prospects are **re-engaged, not dropped**.
- Honor `suppressions` everywhere; never re-enroll a suppressed prospect.
- Threading headers on every follow-up; dedupe by `gmail_message_id`.
- **All FKs to `prospects` are `text`** (id is TEXT). First name = `data->>'fname'`, email = `data->>'email'`.
- New tables are **additive `ensureTable` modules** called from `initDb()`; never alter the `prospects` table; existing prospect/report features must keep working.
- **Do not touch** the `enterprise-dashboard` service account or any Sheets config in flow-23225.
- Clerk-gate all new app routes/pages (public exceptions: `/unsubscribe`, and any open-pixel endpoint).
