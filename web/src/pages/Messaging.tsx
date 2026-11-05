// Phase 1 — email plumbing proof. Deliberately bare: connect a Gmail account,
// send a test email (threaded), run the inbound sync, and see the stored
// outbound + inbound messages round-trip into the app. Phase 2 replaces this
// with the real two-pane Conversations inbox.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  fetchEmailAccounts,
  startGoogleOAuth,
  fetchConversations,
  fetchMessages,
  sendMessage,
  runSync,
} from "@/lib/api";
import type { EmailAccount, Conversation, Message } from "@/lib/types";

function connectBanner(): { ok: boolean; text: string } | null {
  const q = new URLSearchParams(window.location.search);
  if (!q.has("connected")) return null;
  if (q.get("connected") === "1") {
    return { ok: true, text: `Connected ${q.get("email") ?? "account"}.` };
  }
  return { ok: false, text: `Connection failed: ${q.get("reason") ?? "unknown error"}.` };
}

export function Messaging() {
  const { getToken } = useAuth();
  const token = useCallback(() => getToken(), [getToken]);

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner] = useState(connectBanner);

  // Compose (test send)
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await fetchEmailAccounts(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
    }
  }, [token]);

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await fetchConversations(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversations");
    }
  }, [token]);

  useEffect(() => {
    void loadAccounts();
    void loadConversations();
  }, [loadAccounts, loadConversations]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    void (async () => {
      try {
        setMessages(await fetchMessages(token, selected));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load messages");
      }
    })();
  }, [selected, token]);

  async function handleConnect() {
    setError(null);
    try {
      await startGoogleOAuth(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start OAuth");
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { conversationId } = await sendMessage(token, {
        toEmail: to.trim(),
        subject: subject.trim(),
        bodyText: body,
      });
      setTo("");
      setSubject("");
      setBody("");
      await loadConversations();
      setSelected(conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    setError(null);
    try {
      await runSync(token);
      await loadConversations();
      if (selected) setMessages(await fetchMessages(token, selected));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  const connected = accounts.length > 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Messaging</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Phase 1 — connect a work Gmail account and prove a send + reply
          round-trips through the app. The full inbox arrives in Phase 2.
        </p>
      </div>

      {banner ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            banner.ok
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {/* Connected accounts */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold">Connected accounts</h2>
        {accounts.length === 0 ? (
          <p className="mb-3 text-xs text-neutral-400">
            No Gmail account connected yet. Prospect mail sends from the account
            you connect here (never from the city-report address).
          </p>
        ) : (
          <ul className="mb-3 space-y-1">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md bg-neutral-50 px-3 py-2 text-sm"
              >
                <span className="font-medium">{a.email}</span>
                <span className="text-xs text-neutral-500">{a.status}</span>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={() => void handleConnect()}
          className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          {connected ? "Connect another Gmail" : "Connect Gmail"}
        </button>
      </section>

      {/* Test send */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold">Send a test email</h2>
        <form onSubmit={handleSend} className="space-y-2">
          <input
            type="email"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <input
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message body"
            rows={4}
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <button
            type="submit"
            disabled={busy || !connected}
            className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send test"}
          </button>
          {!connected ? (
            <span className="ml-2 text-xs text-neutral-400">Connect an account first.</span>
          ) : null}
        </form>
      </section>

      {/* Conversations + messages */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Conversations</h2>
          <button
            onClick={() => void handleSync()}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-100 disabled:opacity-50"
          >
            {busy ? "Syncing…" : "Sync now"}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ul className="space-y-1">
            {conversations.length === 0 ? (
              <li className="text-xs text-neutral-400">No conversations yet.</li>
            ) : (
              conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c.id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                      selected === c.id ? "bg-neutral-900 text-white" : "bg-neutral-50 hover:bg-neutral-100"
                    }`}
                  >
                    <span className="truncate">
                      {c.prospect_email || c.subject || c.id.slice(0, 8)}
                      {c.unread ? (
                        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-sky-500 align-middle" />
                      ) : null}
                    </span>
                    <span className={`ml-2 text-xs ${selected === c.id ? "text-neutral-300" : "text-neutral-500"}`}>
                      {c.status}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="space-y-2">
            {!selected ? (
              <p className="text-xs text-neutral-400">Select a conversation.</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-neutral-400">No messages stored yet.</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    m.direction === "outbound"
                      ? "ml-6 border-sky-200 bg-sky-50"
                      : "mr-6 border-neutral-200 bg-neutral-50"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
                    <span>{m.direction === "outbound" ? "→ sent" : "← reply"}</span>
                    <span>{(m.sent_at || m.received_at || m.created_at || "").slice(0, 16).replace("T", " ")}</span>
                  </div>
                  <div className="font-medium">{m.subject}</div>
                  <div className="whitespace-pre-wrap text-neutral-700">
                    {m.body_text || m.snippet}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
