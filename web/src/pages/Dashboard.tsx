import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { fetchProspects } from "@/lib/api";
import type { Prospect } from "@/lib/types";
import { UNIT_NONE } from "@/lib/filters";
import { buildSummary } from "@/lib/summary";

const TILE_LINK: Record<string, string> = {
  total: "/prospects",
  responded: "/prospects?tile=responded",
  tour: "/prospects?tile=tour",
  follow: "/prospects?tile=follow",
  applying: "/prospects?tile=applying",
};

function unitHref(label: string): string {
  if (label === "Not indicated") return `/prospects?unitpref=${UNIT_NONE}`;
  return `/prospects?unitpref=${encodeURIComponent(label)}`;
}

export function Dashboard() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchProspects(() => getToken()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">Error: {error}</p>;

  const summary = buildSummary(rows);
  const stageMax = Math.max(1, ...summary.stages.map((s) => s.value));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-xs text-neutral-500">{rows.length} prospects · live</p>
      </div>

      {/* Status tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {summary.headline.map((t) => (
          <Link
            key={t.key}
            to={TILE_LINK[t.key] ?? "/prospects"}
            className="rounded-xl border border-neutral-200 bg-white p-4 text-center transition-colors hover:border-neutral-300 hover:bg-neutral-50"
          >
            <div className="text-2xl font-semibold">{t.value}</div>
            <div className="mt-1 text-xs text-neutral-500">{t.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Unit-type breakdown */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold">Unit preference</h2>
          <ul className="space-y-2">
            {summary.units.map((u) => (
              <li key={u.label}>
                <Link
                  to={unitHref(u.label)}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-neutral-50"
                >
                  <span className="text-neutral-700">{u.label}</span>
                  <span className="font-semibold tabular-nums">{u.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Leasing-stage funnel */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold">Leasing stage</h2>
          <ul className="space-y-2">
            {summary.stages.map((s) => (
              <li key={s.label}>
                <Link
                  to={`/prospects?stage=${encodeURIComponent(s.label)}`}
                  className="block rounded-md p-1.5 hover:bg-neutral-50"
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-neutral-700">{s.label}</span>
                    <span className="font-semibold tabular-nums">{s.value}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full bg-neutral-800"
                      style={{ width: `${(s.value / stageMax) * 100}%` }}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
