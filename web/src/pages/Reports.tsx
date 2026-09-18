import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  addRecipient,
  deleteRecipient,
  fetchRecipients,
} from "@/lib/api";
import type { Recipient } from "@/lib/types";

export function Reports() {
  const { getToken } = useAuth();
  const token = useCallback(() => getToken(), [getToken]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRecipients(await fetchRecipients(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addRecipient(token, { email: email.trim(), name: name.trim() });
      setEmail("");
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(r: Recipient) {
    if (!window.confirm(`Remove ${r.email} from the report list?`)) return;
    try {
      await deleteRecipient(token, r.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-neutral-500">
          A CSV of all prospects is emailed to the recipients below on a schedule.
          Export the current view any time from the Prospects page.
        </p>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold">Scheduled city report</h2>
        <dl className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Cadence</dt>
            <dd className="font-medium">Weekly · Mondays ~8:00 AM PT</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Delivery</dt>
            <dd className="font-medium">Email with CSV attachment</dd>
          </div>
        </dl>

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Recipients
        </h3>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <ul className="mb-4 space-y-1">
            {recipients.length === 0 ? (
              <li className="text-xs text-neutral-400">
                No recipients yet — the report won't send until you add one.
              </li>
            ) : (
              recipients.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md bg-neutral-50 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{r.email}</span>
                    {r.name ? (
                      <span className="ml-2 text-neutral-500">{r.name}</span>
                    ) : null}
                  </span>
                  <button
                    className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    onClick={() => void handleRemove(r)}
                  >
                    Remove
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@sanjoseca.gov"
              className="w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Name (optional)
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add recipient"}
          </button>
        </form>

        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      </section>

      <p className="text-xs text-neutral-400">
        Schedule runs via GitHub Actions (UTC cron; drifts 1h with daylight saving).
      </p>
    </div>
  );
}
