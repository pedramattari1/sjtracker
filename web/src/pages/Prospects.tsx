import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { fetchProspects } from "@/lib/api";
import type { Prospect } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_LBL: Record<string, string> = {
  warm: "Warm",
  new: "New",
  follow: "Follow-up",
  cold: "Unresponsive",
  none: "Not proceeding",
};
const STATUS_CLS: Record<string, string> = {
  warm: "bg-lime-100 text-lime-800",
  new: "bg-sky-100 text-sky-800",
  follow: "bg-amber-100 text-amber-800",
  cold: "bg-red-100 text-red-800",
  none: "bg-red-100 text-red-800",
};
const TOURED_LBL: Record<string, string> = {
  yes: "Yes — done",
  scheduled: "Scheduled",
  no: "No",
};
const TOURED_CLS: Record<string, string> = {
  yes: "bg-lime-100 text-lime-800",
  scheduled: "bg-amber-100 text-amber-800",
  no: "bg-neutral-100 text-neutral-600",
};

function fmtDate(d: string): string {
  if (!d) return "—";
  const p = d.split("-");
  if (p.length !== 3) return d;
  return `${p[1]}/${p[2]}/${p[0].slice(2)}`;
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
        cls,
      )}
    >
      {label}
    </span>
  );
}

export function Prospects() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<Prospect[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchProspects(() => getToken());
      setRows(data);
      setError(null);
      setSyncedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
    timer.current = window.setInterval(() => void load(), 5000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Prospects</h1>
          <p className="text-xs text-neutral-500">
            {loading
              ? "Loading…"
              : error
                ? `Error: ${error}`
                : `${rows.length} prospects${syncedAt ? ` · synced ${syncedAt}` : ""}`}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[1020px] border-collapse">
          <thead>
            <tr className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="border-b border-neutral-200 px-3 py-2.5">Name</th>
              <th className="border-b border-neutral-200 px-3 py-2.5">Email / phone</th>
              <th className="border-b border-neutral-200 px-3 py-2.5">Contacted</th>
              <th className="border-b border-neutral-200 px-3 py-2.5">Responded</th>
              <th className="border-b border-neutral-200 px-3 py-2.5">Status</th>
              <th className="border-b border-neutral-200 px-3 py-2.5">Unit pref.</th>
              <th className="border-b border-neutral-200 px-3 py-2.5">Toured</th>
              <th className="border-b border-neutral-200 px-3 py-2.5">Leasing stage</th>
              <th className="border-b border-neutral-200 px-3 py-2.5">Notes / feedback</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r._id} className="align-top hover:bg-neutral-50">
                <td className="border-b border-neutral-100 px-3 py-2.5 text-sm font-semibold">
                  {i + 1}. {r.fname} {r.lname}
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5 text-xs text-neutral-500">
                  {r.email || "—"}
                  {r.phone ? (
                    <>
                      <br />
                      {r.phone}
                    </>
                  ) : null}
                </td>
                <td className="whitespace-nowrap border-b border-neutral-100 px-3 py-2.5 text-sm">
                  {fmtDate(r.referred)}
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5">
                  <Badge
                    label={r.responded === "yes" ? "Yes" : "No"}
                    cls={
                      r.responded === "yes"
                        ? "bg-lime-100 text-lime-800"
                        : "bg-neutral-100 text-neutral-600"
                    }
                  />
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5">
                  <Badge
                    label={STATUS_LBL[r.status] ?? r.status}
                    cls={STATUS_CLS[r.status] ?? "bg-sky-100 text-sky-800"}
                  />
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5 text-xs text-neutral-500">
                  {r.unitpref || "—"}
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5">
                  <Badge
                    label={TOURED_LBL[r.toured] ?? r.toured}
                    cls={TOURED_CLS[r.toured] ?? "bg-neutral-100 text-neutral-600"}
                  />
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5 text-xs">
                  {r.stage || "—"}
                </td>
                <td className="max-w-[240px] whitespace-pre-wrap border-b border-neutral-100 px-3 py-2.5 text-xs text-neutral-500">
                  {r.notes || "—"}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !error ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-sm text-neutral-400"
                >
                  No prospects.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
