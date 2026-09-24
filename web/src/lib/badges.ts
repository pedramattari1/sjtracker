// Centralized pill labels + color classes so every badge/inline-select looks
// consistent. Class strings are literal so Tailwind includes them.

export const PILL_BASE =
  "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold";

// Inline <select> styled as a colored pill.
export const PILL_SELECT_BASE =
  "cursor-pointer appearance-none rounded-full border-0 px-2.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-sky-400";

export const STATUS_CLS: Record<string, string> = {
  new: "bg-sky-100 text-sky-800",
  warm: "bg-lime-100 text-lime-800",
  follow: "bg-amber-100 text-amber-800",
  cold: "bg-red-100 text-red-800",
  none: "bg-neutral-200 text-neutral-700",
};

export const TOURED_CLS: Record<string, string> = {
  no: "bg-neutral-100 text-neutral-600",
  scheduled: "bg-amber-100 text-amber-800",
  yes: "bg-lime-100 text-lime-800",
};

export const STAGE_CLS: Record<string, string> = {
  "Initial outreach": "bg-neutral-100 text-neutral-600",
  "Scheduling call / tour": "bg-sky-100 text-sky-800",
  "Tour scheduled": "bg-amber-100 text-amber-800",
  "Tour completed": "bg-violet-100 text-violet-800",
  "Application in progress": "bg-blue-100 text-blue-800",
  "Application submitted": "bg-indigo-100 text-indigo-800",
  "Lease signed": "bg-lime-100 text-lime-800",
  "Not proceeding": "bg-red-100 text-red-800",
};

export const RESPONDED_CLS = {
  yes: "bg-lime-100 text-lime-800",
  no: "bg-neutral-100 text-neutral-600",
};

export function statusCls(v: string): string {
  return STATUS_CLS[v] ?? "bg-sky-100 text-sky-800";
}
export function touredCls(v: string): string {
  return TOURED_CLS[v] ?? "bg-neutral-100 text-neutral-600";
}
export function stageCls(v: string): string {
  return STAGE_CLS[v] ?? "bg-neutral-100 text-neutral-600";
}
