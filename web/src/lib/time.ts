// All conversation timestamps render in the VIEWER's local timezone (never UTC).
// Stored values are ISO-8601 UTC strings; Date parses them and the Intl
// formatters below emit local time because no `timeZone` is passed.

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Compact relative time for the thread list, e.g. "just now", "2h", "3d", "Mar 4". */
export function fmtRelative(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return "";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  // Older: local month/day (+ year if not this year).
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

/** Full local timestamp for a message bubble, e.g. "Nov 4, 2026, 3:21 PM". */
export function fmtAbsolute(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Local time-of-day only, e.g. "3:21 PM" (used in the timeline). */
export function fmtTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
