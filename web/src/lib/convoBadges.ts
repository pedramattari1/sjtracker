// Conversation status + reply-tag pill styling (separate from the prospect's own
// status in badges.ts). Literal class strings so Tailwind keeps them. Matches
// the pill conventions in lib/badges.ts.

import type { ConversationStatus } from "@/lib/types";

export const CONVO_STATUS_OPTIONS: { value: ConversationStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "engaged", label: "Engaged" },
  { value: "interested", label: "Interested" },
  { value: "future", label: "Future" },
  { value: "not_interested", label: "Not interested" },
  { value: "toured", label: "Toured" },
  { value: "leased", label: "Leased" },
  { value: "lost", label: "Lost" },
  { value: "dormant", label: "Dormant" },
];

const CONVO_STATUS_CLS: Record<string, string> = {
  new: "bg-sky-100 text-sky-800",
  contacted: "bg-neutral-200 text-neutral-700",
  engaged: "bg-lime-100 text-lime-800",
  interested: "bg-green-100 text-green-800",
  future: "bg-violet-100 text-violet-800",
  not_interested: "bg-red-100 text-red-800",
  toured: "bg-blue-100 text-blue-800",
  leased: "bg-emerald-100 text-emerald-800",
  lost: "bg-neutral-300 text-neutral-700",
  dormant: "bg-amber-100 text-amber-800",
};

export function convoStatusCls(v: string): string {
  return CONVO_STATUS_CLS[v] ?? "bg-neutral-200 text-neutral-700";
}

export function convoStatusLabel(v: string): string {
  return CONVO_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

// Reply tags (spec §3.4) — displayed in Phase 2, set in Phase 3.
export const TAG_OPTIONS: { value: string; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "timing", label: "Timing" },
  { value: "needs_info", label: "Needs info" },
];

const TAG_CLS: Record<string, string> = {
  interested: "bg-green-100 text-green-800",
  not_interested: "bg-red-100 text-red-800",
  timing: "bg-amber-100 text-amber-800",
  needs_info: "bg-sky-100 text-sky-800",
};

export function tagCls(v: string): string {
  return TAG_CLS[v] ?? "bg-neutral-200 text-neutral-700";
}

export function tagLabel(v: string): string {
  return TAG_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

// Move-in timeframe (spec §3.3). next_year/later park the prospect for re-engage.
export const TIMEFRAME_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Unknown" },
  { value: "this_year", label: "This year" },
  { value: "next_year", label: "Next year" },
  { value: "later", label: "Later" },
];

export function timeframeLabel(v: string | null | undefined): string {
  return TIMEFRAME_OPTIONS.find((o) => o.value === (v ?? ""))?.label ?? "Unknown";
}
