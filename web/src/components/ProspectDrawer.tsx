import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Prospect, ProspectInput } from "@/lib/types";
import { toInput } from "@/lib/api";
import { syncTouredForStage } from "@/lib/prospectSync";
import {
  RESPONDED_OPTIONS,
  STAGE_OPTIONS,
  STATUS_OPTIONS,
  TOURED_OPTIONS,
  UNIT_OPTIONS,
} from "@/lib/constants";

interface Props {
  open: boolean;
  initial?: Prospect | null; // present = edit, absent = add
  onClose: () => void;
  onSave: (rec: ProspectInput) => Promise<void>;
  onDelete?: (row: Prospect) => Promise<void>;
}

const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500";
const fieldCls =
  "w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400";

export function ProspectDrawer({ open, initial, onClose, onSave, onDelete }: Props) {
  const [rec, setRec] = useState<ProspectInput>(toInput({}));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const touredTouched = useRef(false);

  useEffect(() => {
    if (open) {
      setRec(toInput(initial ?? {}));
      setErr(null);
      setSaving(false);
      touredTouched.current = false;
    }
  }, [open, initial]);

  const set = (k: keyof ProspectInput, v: string) =>
    setRec((prev) => ({ ...prev, [k]: v }));

  function onStageChange(stage: string) {
    // auto-sync toured unless the user set it manually in this edit
    setRec((prev) => syncTouredForStage({ ...prev, stage }, touredTouched.current));
  }
  function onTouredChange(toured: string) {
    touredTouched.current = true;
    set("toured", toured);
  }

  async function handleSave() {
    if (!rec.fname.trim()) {
      setErr("Enter a first name.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...rec, fname: rec.fname.trim() });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial || !onDelete) return;
    await onDelete(initial);
    onClose();
  }

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* backdrop */}
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      {/* panel */}
      <div
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h3 className="text-base font-semibold">
            {initial ? "Edit prospect" : "Add prospect"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First name</label>
              <input className={fieldCls} value={rec.fname} onChange={(e) => set("fname", e.target.value)} placeholder="First name" />
            </div>
            <div>
              <label className={labelCls}>Last name</label>
              <input className={fieldCls} value={rec.lname} onChange={(e) => set("lname", e.target.value)} placeholder="Last name" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input className={fieldCls} type="email" value={rec.email} onChange={(e) => set("email", e.target.value)} placeholder="name@email.com" />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={fieldCls} value={rec.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(408) 555-0100" />
            </div>
            <div>
              <label className={labelCls}>Date contacted</label>
              <input className={fieldCls} type="date" value={rec.referred} onChange={(e) => set("referred", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Unit preference</label>
              <select className={fieldCls} value={rec.unitpref} onChange={(e) => set("unitpref", e.target.value)}>
                {UNIT_OPTIONS.map((o) => (<option key={o.label} value={o.value}>{o.label}</option>))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Responded?</label>
              <select className={fieldCls} value={rec.responded} onChange={(e) => set("responded", e.target.value)}>
                {RESPONDED_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select className={fieldCls} value={rec.status} onChange={(e) => set("status", e.target.value)}>
                {STATUS_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Toured?</label>
              <select className={fieldCls} value={rec.toured} onChange={(e) => onTouredChange(e.target.value)}>
                {TOURED_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Leasing stage</label>
              <select className={fieldCls} value={rec.stage} onChange={(e) => onStageChange(e.target.value)}>
                {STAGE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes / tour feedback</label>
            <textarea
              className={`${fieldCls} min-h-[160px] resize-y`}
              value={rec.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Concerns, questions, feedback, next steps…"
            />
          </div>

          {err ? <p className="text-xs text-red-600">{err}</p> : null}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-4">
          {initial && onDelete ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-neutral-300 px-3.5 py-2 text-sm hover:bg-neutral-50">
              Cancel
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
