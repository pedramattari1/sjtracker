// Inbound sync engine (spec §2.4 / §5). Per account, every 90s:
//   1. refresh an access token from the stored (encrypted) refresh token
//   2. pull History API deltas since last_history_id (messageAdded)
//   3. for each new message: dedupe by gmail_message_id, match a conversation by
//      gmail_thread_id, store the message, and — for inbound replies — flip the
//      conversation unread + engaged (clearing snooze)
//   4. advance last_history_id to the newest historyId seen
//
// Idempotent throughout (UNIQUE gmail_message_id + ON CONFLICT DO NOTHING).
// Phase 1 runs this in-process (setInterval) alongside the report scheduler.
//
// Deferred to later phases (left as clearly-marked TODOs, not silently skipped):
//   - bounce -> suppressions + stop enrollment (Phase 5; we DO flag is_bounce)
//   - pausing the active sequence enrollment on reply (Phase 5; no enrollments
//     table yet, so there is nothing to pause in Phase 1)

const google = require('./google');
const emailAccounts = require('./emailAccounts');
const conversations = require('./conversations');
const messages = require('./messages');

const POLL_MS = Number(process.env.INBOUND_POLL_MS || 90_000);

/**
 * Collect the added message ids across all history pages, and track the max
 * historyId so we can advance the baseline even when nothing matched.
 */
async function collectAddedMessageIds(accessToken, startHistoryId) {
  const ids = new Set();
  let maxHistoryId = startHistoryId ? BigInt(startHistoryId) : 0n;
  let pageToken;
  do {
    const resp = await google.historyList({ accessToken, startHistoryId, pageToken });
    if (resp.historyId) {
      try { const h = BigInt(resp.historyId); if (h > maxHistoryId) maxHistoryId = h; } catch { /* ignore */ }
    }
    for (const h of resp.history || []) {
      if (h.id) { try { const v = BigInt(h.id); if (v > maxHistoryId) maxHistoryId = v; } catch { /* ignore */ } }
      for (const added of h.messagesAdded || []) {
        if (added.message?.id) ids.add(added.message.id);
      }
    }
    pageToken = resp.nextPageToken;
  } while (pageToken);
  return { ids: [...ids], maxHistoryId: maxHistoryId.toString() };
}

/**
 * Sync a single account. Returns a small result summary (handy for the manual
 * /api/sync/run route and for logging).
 */
async function syncAccount(pool, accountId) {
  const account = await emailAccounts.getById(pool, accountId);
  if (!account) return { ok: false, reason: 'account_not_found', accountId };
  if (account.status !== 'active') return { ok: true, skipped: true, reason: 'inactive', accountId };
  if (!account.last_history_id) {
    // No baseline — connect-time seeding should have set this. Nothing to pull.
    return { ok: true, skipped: true, reason: 'no_history_baseline', accountId };
  }

  const refreshToken = await emailAccounts.getDecryptedRefreshToken(pool, accountId);
  if (!refreshToken) return { ok: false, reason: 'no_refresh_token', accountId };

  let accessToken;
  try {
    accessToken = await google.refreshAccessToken(refreshToken);
  } catch (e) {
    console.error(`[gmailSync] token refresh failed for ${account.email}: ${e.message}`);
    return { ok: false, reason: 'token_refresh_failed', accountId };
  }

  let added;
  try {
    added = await collectAddedMessageIds(accessToken, account.last_history_id);
  } catch (e) {
    // A 404 on history means startHistoryId is too old; Gmail says to re-sync
    // from a fresh profile historyId. Reseed the baseline so we recover.
    if (e.status === 404) {
      try {
        const profile = await google.getProfile(accessToken);
        if (profile.historyId) await emailAccounts.setHistoryId(pool, accountId, profile.historyId);
        console.warn(`[gmailSync] history 404 for ${account.email}; reseeded baseline to ${profile.historyId}`);
      } catch (e2) { console.error('[gmailSync] reseed failed:', e2.message); }
      return { ok: true, reseeded: true, accountId };
    }
    console.error(`[gmailSync] history list failed for ${account.email}: ${e.message}`);
    return { ok: false, reason: 'history_failed', accountId };
  }

  let stored = 0;
  let matched = 0;
  for (const id of added.ids) {
    if (await messages.existsByGmailId(pool, id)) continue;
    let parsed;
    try {
      const raw = await google.messageGet({ accessToken, id });
      parsed = google.parseMessage(raw);
    } catch (e) {
      console.error(`[gmailSync] message get ${id} failed: ${e.message}`);
      continue;
    }

    const convo = await conversations.findByThreadId(pool, parsed.gmailThreadId);
    if (!convo) {
      // No matching conversation (e.g. the account's own unrelated mail, or an
      // outbound we already stored at send time). Ignore — unmatched bucket is
      // Phase 6. We still advance last_history_id below.
      continue;
    }
    matched++;

    // Skip our own outbound echoes: if this account sent it, direction=outbound
    // was already stored at send time and would have been caught by the dedupe
    // above; anything reaching here that is FROM the account is not a reply.
    const fromIsAccount = parsed.fromEmail.toLowerCase().includes(String(account.email).toLowerCase());
    const direction = fromIsAccount ? 'outbound' : 'inbound';

    const inserted = await messages.insertMessage(pool, {
      conversationId: convo.id,
      direction,
      gmailMessageId: parsed.gmailMessageId,
      gmailThreadId: parsed.gmailThreadId,
      rfc822MessageId: parsed.rfc822MessageId,
      fromEmail: parsed.fromEmail,
      toEmail: parsed.toEmail,
      subject: parsed.subject,
      bodyHtml: parsed.bodyHtml,
      bodyText: parsed.bodyText,
      snippet: parsed.snippet,
      isBounce: parsed.isBounce,
      receivedAt: parsed.receivedAt,
    });
    if (!inserted) continue;
    stored++;

    if (direction === 'inbound') {
      // A real reply: route it to the inbox (unread + engaged, clear snooze).
      await conversations.markInboundReply(pool, convo.id, parsed.receivedAt);
      // TODO(Phase 5): pause the active sequence enrollment; on is_bounce add to
      // suppressions and stop the enrollment.
    }
  }

  if (added.maxHistoryId && added.maxHistoryId !== String(account.last_history_id)) {
    await emailAccounts.setHistoryId(pool, accountId, added.maxHistoryId);
  }

  return { ok: true, accountId, email: account.email, considered: added.ids.length, matched, stored };
}

/** Sync every active account once. */
async function syncAll(pool) {
  const accounts = await emailAccounts.listAccounts(pool);
  const results = [];
  for (const a of accounts) {
    if (a.status !== 'active') continue;
    results.push(await syncAccount(pool, a.id));
  }
  return results;
}

/** Start the in-process inbound poll loop (spec §5 in-process option). */
function startInboundPoll(pool) {
  const tick = async () => {
    try {
      const results = await syncAll(pool);
      const totalStored = results.reduce((n, r) => n + (r.stored || 0), 0);
      if (totalStored > 0) console.log(`[gmailSync] poll stored ${totalStored} inbound message(s)`);
    } catch (e) {
      console.error('[gmailSync] poll error:', e.message);
    }
  };
  setInterval(() => { void tick(); }, POLL_MS);
  console.log(`[gmailSync] inbound poll every ${Math.round(POLL_MS / 1000)}s (in-process)`);
}

module.exports = { syncAccount, syncAll, startInboundPoll, POLL_MS };
