// Thin Google/Gmail client over native fetch — no `googleapis` dependency, to
// match the repo's lean style (raw pg, fetch-based healthcheck). Covers exactly
// what Phase 1 needs: the OAuth code flow, on-demand access-token refresh, a
// MIME builder with threading headers, Gmail send, and the History API +
// message fetch used by the inbound poll.
//
// This module is stateless: it never reads env for stored secrets and never
// touches the DB. Callers pass client config + tokens in.

const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// User-consent scopes (spec §2.2). gmail.send + gmail.readonly only.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  // identity, so getProfile / the connected email are available
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
];

function cfg() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth env not set (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI)');
  }
  return { clientId, clientSecret, redirectUri };
}

/** The Google consent URL. `state` is our signed CSRF/identity token. */
function buildAuthUrl(state) {
  const { clientId, redirectUri } = cfg();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',   // we want a refresh token
    prompt: 'consent',        // force refresh_token issuance on re-consent
    include_granted_scopes: 'true',
    state,
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

async function postForm(url, form) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Google token endpoint ${res.status}: ${json.error_description || json.error || text}`);
  }
  return json;
}

/** Exchange an auth code for tokens. Returns { refresh_token, access_token, expires_in, ... }. */
async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = cfg();
  return postForm(OAUTH_TOKEN_URL, {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
}

/** Trade a stored refresh token for a fresh access token. */
async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = cfg();
  const json = await postForm(OAUTH_TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  return json.access_token;
}

async function gapi(accessToken, path, { method = 'GET', body, query } = {}) {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  const res = await fetch(`${GMAIL_BASE}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Gmail API ${method} ${path} -> ${res.status}: ${json.error?.message || text}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/** The connected mailbox profile — crucially `historyId`, used as the poll baseline. */
function getProfile(accessToken) {
  return gapi(accessToken, '/profile');
}

// ---- MIME ----

function encodeHeaderWord(value) {
  // RFC 2047 encode when non-ASCII (e.g. a display name with accents).
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/**
 * Build a base64url-encoded RFC 822 message for users.messages.send.
 * Threading: pass inReplyTo/references (the prior message's Message-ID) on
 * follow-ups so Gmail (and the recipient's client) keep everything in one thread.
 * Returns { raw, messageId } — messageId is the generated RFC822 Message-ID we persist.
 *
 * attachments (optional): [{ filename, mimeType, dataBase64 }]. When present the
 * message is wrapped in multipart/mixed: the text/alternative body is the first
 * part, each file a following base64 part with Content-Disposition: attachment.
 */
function buildMime({ fromEmail, fromName, toEmail, subject, bodyText, bodyHtml, inReplyTo, references, attachments }) {
  const domain = (fromEmail.split('@')[1] || 'mail.local').trim();
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`;
  const fromHeader = fromName ? `${encodeHeaderWord(fromName)} <${fromEmail}>` : fromEmail;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${toEmail}`,
    `Subject: ${encodeHeaderWord(subject || '')}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);

  // The body part: its own Content-Type header line(s) + content. Nested inside
  // multipart/mixed when there are attachments, else inlined at the top level.
  let bodyTypeLines;
  let bodyContent;
  if (bodyHtml) {
    const alt = `b_${Math.random().toString(36).slice(2)}`;
    bodyTypeLines = [`Content-Type: multipart/alternative; boundary="${alt}"`];
    bodyContent =
      `--${alt}\r\n` +
      'Content-Type: text/plain; charset="UTF-8"\r\n' +
      'Content-Transfer-Encoding: 8bit\r\n\r\n' +
      `${bodyText || ''}\r\n\r\n` +
      `--${alt}\r\n` +
      'Content-Type: text/html; charset="UTF-8"\r\n' +
      'Content-Transfer-Encoding: 8bit\r\n\r\n' +
      `${bodyHtml}\r\n\r\n` +
      `--${alt}--`;
  } else {
    bodyTypeLines = ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit'];
    bodyContent = bodyText || '';
  }

  const atts = Array.isArray(attachments) ? attachments.filter((a) => a && a.dataBase64) : [];

  let body;
  if (atts.length === 0) {
    headers.push(...bodyTypeLines);
    body = bodyContent;
  } else {
    const mix = `mix_${Math.random().toString(36).slice(2)}`;
    headers.push(`Content-Type: multipart/mixed; boundary="${mix}"`);
    let parts = `--${mix}\r\n${bodyTypeLines.join('\r\n')}\r\n\r\n${bodyContent}\r\n`;
    for (const a of atts) {
      const name = (a.filename || 'attachment').replace(/["\r\n]/g, '_');
      const mime = a.mimeType || 'application/octet-stream';
      // Re-wrap base64 at 76 chars (RFC 2045).
      const wrapped = String(a.dataBase64).replace(/\s+/g, '').replace(/.{76}/g, '$&\r\n');
      parts +=
        `--${mix}\r\n` +
        `Content-Type: ${mime}; name="${encodeHeaderWord(name)}"\r\n` +
        'Content-Transfer-Encoding: base64\r\n' +
        `Content-Disposition: attachment; filename="${encodeHeaderWord(name)}"\r\n\r\n` +
        `${wrapped}\r\n`;
    }
    parts += `--${mix}--`;
    body = parts;
  }

  const mime = `${headers.join('\r\n')}\r\n\r\n${body}`;
  const raw = Buffer.from(mime, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { raw, messageId };
}

/** Send a prepared raw message. threadId (optional) keeps replies in-thread. */
function gmailSend({ accessToken, raw, threadId }) {
  const body = threadId ? { raw, threadId } : { raw };
  return gapi(accessToken, '/messages/send', { method: 'POST', body });
}

/** List history since startHistoryId (deltas). Returns the raw history response. */
function historyList({ accessToken, startHistoryId, pageToken }) {
  const query = { startHistoryId, historyTypes: 'messageAdded' };
  if (pageToken) query.pageToken = pageToken;
  return gapi(accessToken, '/history', { query });
}

/** Fetch a full message (format=full) by id. */
function messageGet({ accessToken, id }) {
  return gapi(accessToken, `/messages/${encodeURIComponent(id)}`, { query: { format: 'full' } });
}

/** Fetch one attachment's bytes (base64url in `data`). */
function attachmentGet({ accessToken, messageId, attachmentId }) {
  return gapi(
    accessToken,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
}

// ---- Parsing helpers for inbound messages ----

function headerValue(payload, name) {
  const h = (payload?.headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function decodeB64Url(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/**
 * Walk the MIME tree and collect attachment parts (anything with a filename and
 * an attachmentId). Returns [{ filename, mimeType, size, attachmentId }].
 */
function extractAttachments(payload) {
  const out = [];
  function walk(part) {
    if (!part) return;
    const hasId = part.body && part.body.attachmentId;
    if (part.filename && hasId) {
      out.push({
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || null,
        attachmentId: part.body.attachmentId,
      });
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  return out;
}

/** Walk the MIME tree and pull text/plain + text/html bodies. */
function extractBodies(payload) {
  let text = '';
  let html = '';
  function walk(part) {
    if (!part) return;
    const mime = part.mimeType || '';
    if (mime === 'text/plain' && part.body?.data) text += decodeB64Url(part.body.data);
    else if (mime === 'text/html' && part.body?.data) html += decodeB64Url(part.body.data);
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  return { text, html };
}

/** Normalize a Gmail message resource into the fields we store. */
function parseMessage(msg) {
  const payload = msg.payload || {};
  const { text, html } = extractBodies(payload);
  const from = headerValue(payload, 'From');
  const to = headerValue(payload, 'To');
  const subject = headerValue(payload, 'Subject');
  const rfc822 = headerValue(payload, 'Message-ID') || headerValue(payload, 'Message-Id');
  const dateMs = msg.internalDate ? Number(msg.internalDate) : Date.now();
  const isBounce = /mailer-daemon|postmaster/i.test(from) ||
    (msg.labelIds || []).includes('CATEGORY_UPDATES') && /delivery (status|failure)/i.test(subject);
  return {
    gmailMessageId: msg.id,
    gmailThreadId: msg.threadId,
    rfc822MessageId: rfc822,
    fromEmail: from,
    toEmail: to,
    subject,
    bodyText: text,
    bodyHtml: html,
    snippet: msg.snippet || '',
    receivedAt: new Date(dateMs).toISOString(),
    labelIds: msg.labelIds || [],
    isBounce: Boolean(isBounce),
  };
}

module.exports = {
  SCOPES,
  buildAuthUrl,
  exchangeCode,
  refreshAccessToken,
  getProfile,
  buildMime,
  gmailSend,
  historyList,
  messageGet,
  attachmentGet,
  parseMessage,
  extractAttachments,
  // exposed for tests
  _internal: { headerValue, extractBodies, decodeB64Url },
};
