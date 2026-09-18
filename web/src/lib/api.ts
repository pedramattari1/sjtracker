import type { Prospect } from "@/lib/types";

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
