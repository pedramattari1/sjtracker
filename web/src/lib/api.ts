import type { Prospect, ProspectInput } from "@/lib/types";

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
