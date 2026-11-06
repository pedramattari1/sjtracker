import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type {
  Conversation,
  Message,
  ConversationNote,
  ConversationEvent,
} from "@/lib/types";
import type { TokenGetter } from "@/lib/api";
import {
  fetchMessages,
  fetchNotes,
  addNote,
  deleteNote,
  fetchEvents,
  sendMessage,
  setConversationStatus,
} from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { fmtAbsolute, fmtRelative } from "@/lib/time";
import { CONVO_STATUS_OPTIONS, convoStatusCls } from "@/lib/convoBadges";
import { cn } from "@/lib/utils";

type Tab = "messages" | "notes" | "activity";

function displayName(c: Conversation): string {
  const full = [c.prospect_fname, c.prospect_lname].filter(Boolean).join(" ").trim();
  return full || c.prospect_email || c.subject || "Conversation";
}

function MessageBubble({ m }: { m: Message }) {
  const [showQuoted, setShowQuoted] = useState(false);
  const outbound = m.direction === "outbound";
  const visible = m.body_visible ?? m.body_text ?? m.snippet ?? "";
  const quotedText = m.body_quoted ?? "";
  const when = outbound ? m.sent_at : m.received_at;
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          outbound ? "bg-sky-600 text-white" : "border border-neutral-200 bg-white text-neutral-800",
          m.is_bounce ? "ring-1 ring-red-400" : "",
        )}
      >
        <div className={cn("mb-1 flex items-center gap-2 text-[11px]", outbound ? "text-sky-100" : "text-neutral-400")}>
          <span className="truncate">{m.from_email}</span>
          <span>·</span>
          <span className="shrink-0">{fmtAbsolute(when || m.created_at)}</span>
          {m.is_bounce ? <span className="font-semibold text-red-200">bounce</span> : null}
        </div>
        <div className="whitespace-pre-wrap break-words">{visible || <span className="italic opacity-70">(no text)</span>}</div>
        {m.has_quoted && quotedText ? (
          <div className="mt-1.5">
            <button
              onClick={() => setShowQuoted((s) => !s)}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
                outbound ? "bg-sky-500/60 text-sky-50 hover:bg-sky-500" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200",
              )}
            >
              {showQuoted ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {showQuoted ? "Hide quoted text" : "Show quoted text"}
            </button>
            {showQuoted ? (
              <pre className={cn("mt-1 whitespace-pre-wrap break-words rounded p-2 text-[12px]", outbound ? "bg-sky-700/40" : "bg-neutral-50 text-neutral-500")}>
                {quotedText}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ThreadView({
  conversation,
  token,
  onBack,
  onChanged,
}: {
  conversation: Conversation;
  token: TokenGetter;
  onBack?: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("messages");
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [events, setEvents] = useState<ConversationEvent[]>([]);
  const [status, setStatus] = useState(conversation.status);
  const [reply, setReply] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = displayName(conversation);

  const loadMessages = useCallback(async () => {
    setMessages(await fetchMessages(token, conversation.id));
  }, [token, conversation.id]);

  useEffect(() => {
    setStatus(conversation.status);
    setTab("messages");
    setReply("");
    setError(null);
    void loadMessages().catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [conversation.id, conversation.status, loadMessages]);

  useEffect(() => {
    if (tab === "notes") void fetchNotes(token, conversation.id).then(setNotes).catch(() => {});
    if (tab === "activity") void fetchEvents(token, conversation.id).then(setEvents).catch(() => {});
  }, [tab, token, conversation.id]);

  async function handleStatus(next: string) {
    setStatus(next);
    try {
      await setConversationStatus(token, conversation.id, next);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status change failed");
      setStatus(conversation.status);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendMessage(token, {
        conversationId: conversation.id,
        subject: conversation.subject ? `Re: ${conversation.subject.replace(/^Re:\s*/i, "")}` : "",
        bodyText: reply,
      });
      setReply("");
      await loadMessages();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNote() {
    if (!noteDraft.trim()) return;
    try {
      await addNote(token, conversation.id, noteDraft.trim());
      setNoteDraft("");
      setNotes(await fetchNotes(token, conversation.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add note failed");
    }
  }

  async function handleDeleteNote(id: string) {
    try {
      await deleteNote(token, conversation.id, id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      /* ignore */
    }
  }

  // Timeline merges message sends/receipts with logged events + notes.
  const timeline = useMemo(() => {
    const items: { at: string; kind: string; text: string }[] = [];
    for (const m of messages) {
      items.push({
        at: m.sent_at || m.received_at || m.created_at,
        kind: m.direction,
        text: m.direction === "outbound" ? "Sent a message" : "Received a reply",
      });
    }
    for (const ev of events) items.push({ at: ev.created_at, kind: ev.type, text: ev.detail || ev.type });
    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [messages, events]);

  const tabBtn = (key: Tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={cn(
        "border-b-2 px-3 py-2 text-sm font-medium",
        tab === key ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-neutral-200 p-3">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button onClick={onBack} className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 md:hidden" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          <Avatar name={name} seed={conversation.prospect_email || conversation.id} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate text-xs text-neutral-500">{conversation.prospect_email || "—"}</div>
          </div>
          <select
            value={status}
            onChange={(e) => void handleStatus(e.target.value)}
            className={cn(
              "cursor-pointer appearance-none rounded-full border-0 px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-sky-400",
              convoStatusCls(status),
            )}
            title="Conversation status"
          >
            {CONVO_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
          <span>Sending from <span className="font-medium text-neutral-600">{conversation.account_email || "—"}</span></span>
          {conversation.prospect_id ? (
            <Link to="/prospects" className="underline hover:text-neutral-700">Prospect detail</Link>
          ) : null}
        </div>
        <div className="mt-2 flex gap-1">
          {tabBtn("messages", "Messages")}
          {tabBtn("notes", "Notes")}
          {tabBtn("activity", "Activity")}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-neutral-50 p-4">
        {tab === "messages" ? (
          <div className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-center text-xs text-neutral-400">No messages yet.</p>
            ) : (
              messages.map((m) => <MessageBubble key={m.id} m={m} />)
            )}
          </div>
        ) : null}

        {tab === "notes" ? (
          <div className="space-y-3">
            {notes.length === 0 ? (
              <p className="text-xs text-neutral-400">No notes yet.</p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-500">
                    <span>{fmtAbsolute(n.created_at)}</span>
                    <button onClick={() => void handleDeleteNote(n.id)} className="text-neutral-400 hover:text-red-600" aria-label="Delete note">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap text-neutral-800">{n.body}</div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "activity" ? (
          <ol className="space-y-2">
            {timeline.length === 0 ? (
              <li className="text-xs text-neutral-400">No activity yet.</li>
            ) : (
              timeline.map((it, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-neutral-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                  <span className="font-medium">{it.text}</span>
                  <span className="ml-auto text-neutral-400">{fmtRelative(it.at)}</span>
                </li>
              ))
            )}
          </ol>
        ) : null}
      </div>

      {/* Composer / note input */}
      {tab === "notes" ? (
        <div className="border-t border-neutral-200 p-3">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add an internal note (not emailed)…"
            rows={2}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <div className="mt-2 flex justify-end">
            <button onClick={() => void handleAddNote()} className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50" disabled={!noteDraft.trim()}>
              Add note
            </button>
          </div>
        </div>
      ) : tab === "messages" ? (
        <form onSubmit={handleSend} className="border-t border-neutral-200 p-3">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={`Reply from ${conversation.account_email || "this account"}…`}
            rows={3}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-neutral-400">Sends as a real email, in-thread.</span>
            <button type="submit" disabled={busy || !reply.trim()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
              {busy ? "Sending…" : "Send reply"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="border-t border-neutral-200 px-3 py-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
