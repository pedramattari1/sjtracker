import type {
  Prospect,
  ProspectInput,
  Recipient,
  EmailAccount,
  Conversation,
  Message,
} from "@/lib/types";

const BASE = import.meta.env.VITE_API_BASE_URL;

/** Getter for the current Clerk session token (from useAuth().getToken). */
export type TokenGetter = () => Promise<string | null>;

async function authHeaders(getToken: TokenGetter): Promise<HeadersInit> {
  const token = await getToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export async function fetchProspects(getToken: TokenGetter): Promise<Prospect[]> {
  const res = await fetch(`${BASE}/api/prospects`, {
    headers: await authHeaders(getToken),
  });
  if (!res.ok) throw new Error(`GET /api/prospects failed: ${res.status}`);
  return (await res.json()) as Prospect[];
}

export async function createProspect(
  getToken: TokenGetter,
  rec: ProspectInput,
): Promise<Prospect> {
  const res = await fetch(`${BASE}/api/prospects`, {
    method: "POST",
    headers: await authHeaders(getToken),
    body: JSON.stringify(rec),
  });
  if (!res.ok) throw new Error(`POST /api/prospects failed: ${res.status}`);
  return (await res.json()) as Prospect;
}

/**
 * Update a prospect. Sends the COMPLETE record — the server replaces the whole
 * `data` JSONB, so a partial body would blank the omitted fields. Callers must
 * pass every field (change only the ones they mean to).
 */
export async function updateProspect(
  getToken: TokenGetter,
  id: string,
  rec: ProspectInput,
): Promise<Prospect> {
  const res = await fetch(`${BASE}/api/prospects/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: await authHeaders(getToken),
    body: JSON.stringify(rec),
  });
  if (!res.ok) throw new Error(`PUT /api/prospects/${id} failed: ${res.status}`);
  return (await res.json()) as Prospect;
}

export async function deleteProspect(
  getToken: TokenGetter,
  id: string,
): Promise<void> {
  const res = await fetch(`${BASE}/api/prospects/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await authHeaders(getToken),
  });
  if (!res.ok) throw new Error(`DELETE /api/prospects/${id} failed: ${res.status}`);
}

/**
 * Download a CSV of prospects honoring the given filter params. Fetches with the
 * Clerk token (the route is protected), then triggers a browser download.
 */
export async function downloadProspectsCsv(
  getToken: TokenGetter,
  params: URLSearchParams,
): Promise<void> {
  const qs = params.toString();
  const res = await fetch(`${BASE}/api/prospects/export${qs ? `?${qs}` : ""}`, {
    headers: await authHeaders(getToken),
  });
  if (!res.ok) throw new Error(`export failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prospects-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- City-report recipients ----
export async function fetchRecipients(getToken: TokenGetter): Promise<Recipient[]> {
  const res = await fetch(`${BASE}/api/recipients`, {
    headers: await authHeaders(getToken),
  });
  if (!res.ok) throw new Error(`GET /api/recipients failed: ${res.status}`);
  return (await res.json()) as Recipient[];
}

export async function addRecipient(
  getToken: TokenGetter,
  rec: { email: string; name: string },
): Promise<Recipient> {
  const res = await fetch(`${BASE}/api/recipients`, {
    method: "POST",
    headers: await authHeaders(getToken),
    body: JSON.stringify(rec),
  });
  if (!res.ok) {
    const msg = res.status === 400 ? "Enter a valid email." : `Add failed: ${res.status}`;
    throw new Error(msg);
  }
  return (await res.json()) as Recipient;
}

export async function deleteRecipient(
  getToken: TokenGetter,
  id: string,
): Promise<void> {
  const res = await fetch(`${BASE}/api/recipients/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await authHeaders(getToken),
  });
  if (!res.ok) throw new Error(`DELETE /api/recipients/${id} failed: ${res.status}`);
}

// ---- Nurture / two-way messaging (Phase 1) ----

export async function fetchEmailAccounts(getToken: TokenGetter): Promise<EmailAccount[]> {
  const res = await fetch(`${BASE}/api/email-accounts`, {
    headers: await authHeaders(getToken),
  });
  if (!res.ok) throw new Error(`GET /api/email-accounts failed: ${res.status}`);
  return (await res.json()) as EmailAccount[];
}

/** Kick off Google OAuth: fetch the signed consent URL, then redirect the browser. */
export async function startGoogleOAuth(getToken: TokenGetter): Promise<void> {
  const res = await fetch(`${BASE}/api/oauth/google/start`, {
    headers: await authHeaders(getToken),
  });
  if (!res.ok) throw new Error(`OAuth start failed: ${res.status}`);
  const { url } = (await res.json()) as { url: string };
  window.location.href = url;
}

export async function fetchConversations(getToken: TokenGetter): Promise<Conversation[]> {
  const res = await fetch(`${BASE}/api/conversations`, {
    headers: await authHeaders(getToken),
  });
  if (!res.ok) throw new Error(`GET /api/conversations failed: ${res.status}`);
  return (await res.json()) as Conversation[];
}

export async function fetchMessages(
  getToken: TokenGetter,
  conversationId: string,
): Promise<Message[]> {
  const res = await fetch(
    `${BASE}/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    { headers: await authHeaders(getToken) },
  );
  if (!res.ok) throw new Error(`GET messages failed: ${res.status}`);
  return (await res.json()) as Message[];
}

export interface SendMessageInput {
  prospectId?: string;
  toEmail?: string;
  subject: string;
  bodyText: string;
}

export async function sendMessage(
  getToken: TokenGetter,
  input: SendMessageInput,
): Promise<{ conversationId: string; gmailThreadId: string }> {
  const res = await fetch(`${BASE}/api/messages/send`, {
    method: "POST",
    headers: await authHeaders(getToken),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error(body.detail || body.error || `send failed: ${res.status}`);
  }
  return (await res.json()) as { conversationId: string; gmailThreadId: string };
}

/** Trigger an immediate inbound sync (don't wait for the 90s poll). */
export async function runSync(getToken: TokenGetter): Promise<void> {
  const res = await fetch(`${BASE}/api/sync/run`, {
    method: "POST",
    headers: await authHeaders(getToken),
  });
  if (!res.ok) throw new Error(`sync failed: ${res.status}`);
}

/** Build a full ProspectInput from a possibly-partial record (fills blanks). */
export function toInput(r: Partial<Prospect>): ProspectInput {
  return {
    fname: r.fname ?? "",
    lname: r.lname ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    referred: r.referred ?? "",
    responded: r.responded ?? "no",
    status: r.status ?? "new",
    unitpref: r.unitpref ?? "",
    toured: r.toured ?? "no",
    stage: r.stage ?? "Initial outreach",
    notes: r.notes ?? "",
  };
}
