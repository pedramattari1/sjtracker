// Bulk action bar for the conversations list (Phase 3). Appears when one or more
// threads are selected. Actions: set status, set tag, snooze, clear snooze.
// Suppress + enroll are deferred (Phase 4 / Phase 5).

import { CONVO_STATUS_OPTIONS, TAG_OPTIONS } from "@/lib/convoBadges";
import { SnoozeMenu } from "@/components/SnoozeMenu";

export function BulkActionBar({
  count,
  onStatus,
  onTag,
  onSnooze,
  onClearSnooze,
  onClear,
}: {
  count: number;
  onStatus: (status: string) => void;
  onTag: (tag: string | null) => void;
  onSnooze: (iso: string) => void;
  onClearSnooze: () => void;
  onClear: () => void;
}) {
  const selectCls =
    "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400";
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-sky-50 px-3 py-2">
      <span className="text-xs font-semibold text-neutral-700">{count} selected</span>

      <select className={selectCls} defaultValue="" onChange={(e) => { if (e.target.value) { onStatus(e.target.value); e.target.value = ""; } }}>
        <option value="">Set status…</option>
        {CONVO_STATUS_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>

      <select
        className={selectCls}
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) onTag(v === "__clear" ? null : v);
          e.target.value = "";
        }}
      >
        <option value="">Set tag…</option>
        {TAG_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        <option value="__clear">— Clear tag —</option>
      </select>

      <SnoozeMenu onPick={onSnooze} onClear={onClearSnooze} showClear />

      <button onClick={onClear} className="ml-auto text-xs text-neutral-500 underline hover:text-neutral-800">
        Clear selection
      </button>
    </div>
  );
}
