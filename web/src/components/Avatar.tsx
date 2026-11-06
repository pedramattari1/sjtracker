// Initials avatar for the conversations inbox. Deterministic color from the
// seed so a given prospect keeps the same hue across the list and thread header.

const COLORS = [
  "bg-sky-100 text-sky-800",
  "bg-lime-100 text-lime-800",
  "bg-amber-100 text-amber-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
  "bg-emerald-100 text-emerald-800",
  "bg-blue-100 text-blue-800",
  "bg-fuchsia-100 text-fuchsia-800",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hue(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Avatar({
  name,
  seed,
  size = "md",
}: {
  name: string;
  seed?: string;
  size?: "sm" | "md";
}) {
  const sizeCls = size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sizeCls} ${hue(seed || name)}`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
