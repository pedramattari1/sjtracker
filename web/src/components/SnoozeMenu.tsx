// Snooze quick-picks + custom date, shared by the thread view and the bulk bar.
// Emits an ISO string (or null to clear). Quick picks resolve in the viewer's
// local timezone.

import { useEffect, useRef, useState } from "react";

function atLocalHour(date: Date, hour: number): Date {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function quickPicks(): { label: string; iso: string }[] {
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const in3 = new Date(now); in3.setDate(now.getDate() + 3);
  const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + 7);
  return [
    { label: "Tomorrow 9am", iso: atLocalHour(tomorrow, 9).toISOString() },
    { label: "In 3 days", iso: atLocalHour(in3, 9).toISOString() },
    { label: "Next week", iso: atLocalHour(nextWeek, 9).toISOString() },
  ];
}

export function SnoozeMenu({
  onPick,
  onClear,
  showClear = false,
  align = "left",
}: {
  onPick: (iso: string) => void;
  onClear?: () => void;
  showClear?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
      >
        Snooze
      </button>
      {open ? (
        <div className={`absolute z-30 mt-1 w-48 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
          {quickPicks().map((p) => (
            <button
              key={p.label}
              onClick={() => { onPick(p.iso); setOpen(false); }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-neutral-100"
            >
              {p.label}
            </button>
          ))}
          <div className="my-1 border-t border-neutral-100" />
          <div className="px-2 py-1">
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-400">Custom date</label>
            <input
              type="date"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="w-full rounded border border-neutral-300 px-1.5 py-1 text-xs"
            />
            <button
              disabled={!custom}
              onClick={() => { if (custom) { onPick(atLocalHour(new Date(`${custom}T09:00`), 9).toISOString()); setOpen(false); } }}
              className="mt-1 w-full rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              Snooze until date
            </button>
          </div>
          {showClear && onClear ? (
            <>
              <div className="my-1 border-t border-neutral-100" />
              <button
                onClick={() => { onClear(); setOpen(false); }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs text-red-700 hover:bg-red-50"
              >
                Clear snooze
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
