// Phase 2 — Conversations inbox. Two-pane on desktop (list + thread), single
// pane on mobile (list -> thread with a back button). A compact header carries
// the connected-account state, Connect Gmail, and Sync now. Snooze, reply-tag
// setting, the prospect-facts sidebar, snippets and the nav badge are Phase 3.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { RefreshCw } from "lucide-react";
import {
  fetchEmailAccounts,
  startGoogleOAuth,
  fetchConversations,
  markConversationRead,
  runSync,
} from "@/lib/api";
import type { EmailAccount, Conversation } from "@/lib/types";
import { ConversationList } from "@/components/ConversationList";
import { ThreadView } from "@/components/ThreadView";

function connectBanner(): { ok: boolean; text: string } | null {
  const q = new URLSearchParams(window.location.search);
  if (!q.has("connected")) return null;
  if (q.get("connected") === "1") return { ok: true, text: `Connected ${q.get("email") ?? "account"}.` };
  return { ok: false, text: `Connection failed: ${q.get("reason") ?? "unknown error"}.` };
}

export function Messaging() {
  const { getToken } = useAuth();
  const token = useCallback(() => getToken(), [getToken]);

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [banner] = useState(connectBanner);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await fetchConversations(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversations");
    }
  }, [token]);

  useEffect(() => {
    void fetchEmailAccounts(token).then(setAccounts).catch(() => {});
    void loadConversations();
    // Light polling so inbound replies surface without a manual refresh.
    const id = window.setInterval(() => void loadConversations(), 15000);
    return () => window.clearInterval(id);
  }, [token, loadConversations]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  async function handleSelect(id: string) {
    setSelectedId(id);
    const convo = conversations.find((c) => c.id === id);
    if (convo?.unread) {
      // Optimistic clear + persist.
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)));
      try { await markConversationRead(token, id); } catch { /* ignore */ }
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await runSync(token);
      await loadConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const connected = accounts.length > 0;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Messaging</h1>
          <p className="text-xs text-neutral-500">
            {connected
              ? `Sending from ${accounts.map((a) => a.email).join(", ")}`
              : "No Gmail connected yet."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleSync()}
            disabled={syncing || !connected}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sync now
          </button>
          <button
            onClick={() => void startGoogleOAuth(token).catch((e) => setError(e instanceof Error ? e.message : "OAuth failed"))}
            className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            {connected ? "Connect another" : "Connect Gmail"}
          </button>
        </div>
      </div>

      {banner ? (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${banner.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {banner.text}
        </div>
      ) : null}
      {error ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

      {!connected ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white">
          <div className="max-w-sm text-center">
            <p className="text-sm font-medium text-neutral-800">Connect a work Gmail to start.</p>
            <p className="mt-1 text-xs text-neutral-500">
              Prospect mail sends from the connected account (never the city-report address) and replies land here and in the real inbox.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {/* List pane — hidden on mobile once a thread is open */}
          <div className={`${selectedId ? "hidden md:flex" : "flex"} w-full flex-col border-r border-neutral-200 md:w-80 lg:w-96`}>
            <ConversationList conversations={conversations} selectedId={selectedId} onSelect={handleSelect} />
          </div>
          {/* Thread pane */}
          <div className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
            {selected ? (
              <ThreadView
                conversation={selected}
                token={token}
                onBack={() => setSelectedId(null)}
                onChanged={loadConversations}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
                Select a conversation.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
