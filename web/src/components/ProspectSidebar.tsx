// Thread right-sidebar (spec §6.2). Prospect facts + timeframe (editable;
// next_year/later sets the re-engage date), reply tag, snooze state, quick
// status buttons, and a read-only enrollment placeholder (populated in Phase 5).

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Conversation, ProspectCrm } from "@/lib/types";
import type { TokenGetter } from "@/lib/api";
import { fetchProspectCrm, saveProspectCrm, setConversationTag } from "@/lib/api";
import { fmtAbsolute } from "@/lib/time";
import {
  CONVO_STATUS_OPTIONS,
  TAG_OPTIONS,
  TIMEFRAME_OPTIONS,
  convoStatusCls,
  tagCls,
} from "@/lib/convoBadges";
import { cn } from "@/lib/utils";

const labelCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400";
const fieldCls = "w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400";

export function ProspectSidebar({
  conversation,
  token,
  onClose,
  onChanged,
}: {
  conversation: Conversation;
  token: TokenGetter;
  onClose?: () => void;
  onChanged: () => void;
}) {
  const [crm, setCrm] = useState<ProspectCrm>({});
  const [saving, setSaving] = useState(false);
  const [tag, setTag] = useState<string | null>(conversation.tag);
  const prospectId = conversation.prospect_id;

  const load = useCallback(async () => {
    if (!prospectId) return;
    try { setCrm(await fetchProspectCrm(token, prospectId)); } catch { /* ignore */ }
  }, [token, prospectId]);

  useEffect(() => { setTag(conversation.tag); void load(); }, [conversation.id, conversation.tag, load]);

  const set = (k: keyof ProspectCrm, v: string) => setCrm((prev) => ({ ...prev, [k]: v }));

  async function save() {
    if (!prospectId) return;
    setSaving(true);
    try {
      const saved = await saveProspectCrm(token, prospectId, {
        timeframe: crm.timeframe ?? "",
        target_move_month: crm.target_move_month ?? "",
        unit_interest: crm.unit_interest ?? "",
        budget: crm.budget ?? "",
        source: crm.source ?? "",
      });
      setCrm(saved); // picks up the computed reengage_at
    } finally {
      setSaving(false);
    }
  }

  async function quickTag(next: string) {
    const value = tag === next ? null : next;
    setTag(value);
    try { await setConversationTag(token, conversation.id, value); onChanged(); } catch { setTag(conversation.tag); }
  }

  const parked = crm.timeframe === "next_year" || crm.timeframe === "later";
  const snoozed = conversation.snoozed_until && new Date(conversation.snoozed_until).getTime() > Date.now();

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-neutral-200 p-3">
        <h3 className="text-sm font-semibold">Details</h3>
        {onClose ? (
          <button onClick={onClose} className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100" aria-label="Close details">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="space-y-4 p-3">
        {/* Reply tag */}
        <div>
          <span className={labelCls}>Reply tag</span>
          <div className="flex flex-wrap gap-1">
            {TAG_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => void quickTag(o.value)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  tag === o.value ? tagCls(o.value) : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prospect facts */}
        <div className="space-y-2">
          <div>
            <label className={labelCls}>Unit interest</label>
            <input className={fieldCls} value={crm.unit_interest ?? ""} onChange={(e) => set("unit_interest", e.target.value)} placeholder="e.g. 1BR" />
          </div>
          <div>
            <label className={labelCls}>Budget</label>
            <input className={fieldCls} value={crm.budget ?? ""} onChange={(e) => set("budget", e.target.value)} placeholder="e.g. $2,000" />
          </div>
          <div>
            <label className={labelCls}>Source</label>
            <input className={fieldCls} value={crm.source ?? ""} onChange={(e) => set("source", e.target.value)} placeholder="e.g. City list" />
          </div>
          <div>
            <label className={labelCls}>Move-in timeframe</label>
            <select className={fieldCls} value={crm.timeframe ?? ""} onChange={(e) => set("timeframe", e.target.value)}>
              {TIMEFRAME_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
            </select>
          </div>
          {parked ? (
            <div>
              <label className={labelCls}>Target move month</label>
              <input className={fieldCls} type="month" value={crm.target_move_month ?? ""} onChange={(e) => set("target_move_month", e.target.value)} />
            </div>
          ) : null}
          <button
            onClick={() => void save()}
            disabled={saving || !prospectId}
            className="w-full rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save facts"}
          </button>
          {parked && crm.reengage_at ? (
            <p className="text-[11px] text-violet-700">
              Parked — re-engage {fmtAbsolute(crm.reengage_at)}
            </p>
          ) : null}
          {!prospectId ? <p className="text-[11px] text-neutral-400">No linked prospect for this thread.</p> : null}
        </div>

        {/* Quick status */}
        <div>
          <span className={labelCls}>Status</span>
          <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", convoStatusCls(conversation.status))}>
            {CONVO_STATUS_OPTIONS.find((o) => o.value === conversation.status)?.label ?? conversation.status}
          </span>
        </div>

        {/* Snooze state */}
        <div>
          <span className={labelCls}>Snooze</span>
          <p className="text-xs text-neutral-600">
            {snoozed ? `Until ${fmtAbsolute(conversation.snoozed_until)}` : "Not snoozed"}
          </p>
        </div>

        {/* Enrollment placeholder (Phase 5) */}
        <div className="rounded-lg border border-dashed border-neutral-300 p-2.5">
          <span className={labelCls}>Sequence</span>
          <p className="text-[11px] text-neutral-400">
            No active sequence. Enrollment &amp; next-send arrive in Phase 5.
          </p>
        </div>
      </div>
    </div>
  );
}
