import { useMemo, useState } from "react";
import type { Conversation } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { fmtRelative } from "@/lib/time";
import {
  CONVO_STATUS_OPTIONS,
  convoStatusCls,
  convoStatusLabel,
  tagCls,
  tagLabel,
} from "@/lib/convoBadges";
import { cn } from "@/lib/utils";

type QuickFilter = "all" | "unread" | "snoozed" | "engaged";

function displayName(c: Conversation): string {
  const full = [c.prospect_fname, c.prospect_lname].filter(Boolean).join(" ").trim();
  return full || c.prospect_email || c.subject || "Conversation";
}

function isSnoozed(c: Conversation): boolean {
  return Boolean(c.snoozed_until && new Date(c.snoozed_until).getTime() > Date.now());
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  selectedIds,
  onToggleSelect,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [search, setSearch] = useState("");

  const tagsPresent = useMemo(
    () => [...new Set(conversations.map((c) => c.tag).filter(Boolean) as string[])],
    [conversations],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      // Future-snoozed threads leave the active views until due; the Snoozed
      // filter is where they live meanwhile (spec §3.4).
      if (quick !== "snoozed" && isSnoozed(c)) return false;
      if (quick === "unread" && !c.unread) return false;
      if (quick === "snoozed" && !isSnoozed(c)) return false;
      if (quick === "engaged" && c.status !== "engaged") return false;
      if (statusFilter && c.status !== statusFilter) return false;
      if (tagFilter && c.tag !== tagFilter) return false;
      if (q) {
        const hay = `${displayName(c)} ${c.prospect_email ?? ""} ${c.last_snippet ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, quick, statusFilter, tagFilter, search]);

  const quickBtn = (key: QuickFilter, label: string) => (
    <button
      onClick={() => setQuick(key)}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        quick === key ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
      )}
    >
      {label}
    </button>
  );

  const selectCls =
    "rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400";

  return (
    <div className="flex h-full flex-col">
      {/* Filters */}
      <div className="space-y-2 border-b border-neutral-200 p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, message…"
          className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {quickBtn("all", "All")}
          {quickBtn("unread", "Unread")}
          {quickBtn("snoozed", "Snoozed")}
          {quickBtn("engaged", "Engaged")}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {CONVO_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            className={selectCls}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            disabled={tagsPresent.length === 0}
          >
            <option value="">All tags</option>
            {tagsPresent.map((t) => (
              <option key={t} value={t}>{tagLabel(t)}</option>
            ))}
          </select>
          {(quick !== "all" || statusFilter || tagFilter || search) ? (
            <button
              className="text-xs text-neutral-500 underline hover:text-neutral-800"
              onClick={() => { setQuick("all"); setStatusFilter(""); setTagFilter(""); setSearch(""); }}
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {/* List */}
      <ul className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <li className="p-4 text-center text-xs text-neutral-400">No conversations.</li>
        ) : (
          visible.map((c) => {
            const name = displayName(c);
            const snippet =
              (c.last_direction === "outbound" ? "You: " : "") + (c.last_snippet || "No messages yet");
            return (
              <li key={c.id} className={cn("flex items-start border-b border-neutral-100", selectedId === c.id ? "bg-sky-50" : "hover:bg-neutral-50")}>
                <label className="flex items-center py-3 pl-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => onToggleSelect(c.id)}
                    className="h-4 w-4 rounded border-neutral-300"
                    aria-label={`Select ${name}`}
                  />
                </label>
                <button
                  onClick={() => onSelect(c.id)}
                  className="flex w-full items-start gap-3 px-3 py-3 text-left"
                >
                  <Avatar name={name} seed={c.prospect_email || c.id} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", c.unread ? "font-semibold text-neutral-900" : "font-medium text-neutral-800")}>
                        {name}
                      </span>
                      <span className="shrink-0 text-[11px] text-neutral-400">
                        {fmtRelative(c.last_message_at || c.created_at)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn("truncate text-xs", c.unread ? "text-neutral-700" : "text-neutral-500")}>
                        {snippet}
                      </span>
                      {c.unread ? <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-sky-500" /> : null}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", convoStatusCls(c.status))}>
                        {convoStatusLabel(c.status)}
                      </span>
                      {c.tag ? (
                        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", tagCls(c.tag))}>
                          {tagLabel(c.tag)}
                        </span>
                      ) : null}
                      {isSnoozed(c) ? (
                        <span className="inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
                          Snoozed
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
