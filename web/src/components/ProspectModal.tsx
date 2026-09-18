import { useEffect, useState } from "react";
import type { Prospect, ProspectInput } from "@/lib/types";
import { toInput } from "@/lib/api";
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
}

const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500";
const field =
  "w-full rounded-lg border border-neutral-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400";

export function ProspectModal({ open, initial, onClose, onSave }: Props) {
  const [rec, setRec] = useState<ProspectInput>(toInput({}));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRec(toInput(initial ?? {}));
      setErr(null);
      setSaving(false);
    }
  }, [open, initial]);

  if (!open) return null;

  const set = (k: keyof ProspectInput, v: string) =>
    setRec((prev) => ({ ...prev, [k]: v }));

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-5 text-base font-semibold">
          {initial ? "Edit prospect" : "Add prospect"}
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>First name</label>
            <input
              className={field}
              value={rec.fname}
              onChange={(e) => set("fname", e.target.value)}
              placeholder="First name"
            />
          </div>
          <div>
            <label className={label}>Last name</label>
            <input
              className={field}
              value={rec.lname}
              onChange={(e) => set("lname", e.target.value)}
              placeholder="Last name"
            />
          </div>
          <div>
            <label className={label}>Email</label>
            <input
              className={field}
              type="email"
              value={rec.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="name@email.com"
            />
          </div>
          <div>
            <label className={label}>Phone</label>
            <input
              className={field}
              value={rec.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="(408) 555-0100"
            />
          </div>
          <div>
            <label className={label}>Date contacted</label>
            <input
              className={field}
              type="date"
              value={rec.referred}
              onChange={(e) => set("referred", e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Unit preference</label>
            <select
              className={field}
              value={rec.unitpref}
              onChange={(e) => set("unitpref", e.target.value)}
            >
              {UNIT_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Responded?</label>
            <select
              className={field}
              value={rec.responded}
              onChange={(e) => set("responded", e.target.value)}
            >
              {RESPONDED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Status</label>
            <select
              className={field}
              value={rec.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Toured?</label>
            <select
              className={field}
              value={rec.toured}
              onChange={(e) => set("toured", e.target.value)}
            >
              {TOURED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Leasing stage</label>
            <select
              className={field}
              value={rec.stage}
              onChange={(e) => set("stage", e.target.value)}
            >
              {STAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className={label}>Notes / tour feedback</label>
          <textarea
            className={`${field} min-h-[80px] resize-y`}
            value={rec.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Concerns, questions, feedback, next steps…"
          />
        </div>

        {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-lg border border-neutral-300 px-3.5 py-2 text-sm hover:bg-neutral-50"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save prospect"}
          </button>
        </div>
      </div>
    </div>
  );
}
