import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { fetchProspects } from "@/lib/api";
import type { Prospect } from "@/lib/types";
import {
  STAGE_ORDER,
  TILES,
  UNIT_NONE,
  UNIT_ORDER,
} from "@/lib/filters";

const TILE_LINK: Record<string, string> = {
  total: "/prospects",
  responded: "/prospects?tile=responded",
  tour: "/prospects?tile=tour",
  follow: "/prospects?tile=follow",
  applying: "/prospects?tile=applying",
};

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

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">Error: {error}</p>;
  }

  const unitCounts = UNIT_ORDER.map((u) => ({
    label: u,
    href: `/prospects?unitpref=${encodeURIComponent(u)}`,
    count: rows.filter((r) => r.unitpref === u).length,
  }));
  const notIndicated = rows.filter((r) => !r.unitpref).length;
  unitCounts.push({
    label: "Not indicated",
    href: `/prospects?unitpref=${UNIT_NONE}`,
    count: notIndicated,
  });

  const stageCounts = STAGE_ORDER.map((s) => ({
    label: s,
    href: `/prospects?stage=${encodeURIComponent(s)}`,
    count: rows.filter((r) => r.stage === s).length,
  }));
  const stageMax = Math.max(1, ...stageCounts.map((s) => s.count));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-xs text-neutral-500">{rows.length} prospects · live</p>
      </div>

      {/* Status tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {TILES.map((t) => (
          <Link
            key={t.key}
            to={TILE_LINK[t.key]}
            className="rounded-xl border border-neutral-200 bg-white p-4 text-center transition-colors hover:border-neutral-300 hover:bg-neutral-50"
          >
            <div className="text-2xl font-semibold">
              {rows.filter(t.predicate).length}
            </div>
            <div className="mt-1 text-xs text-neutral-500">{t.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Unit-type breakdown */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold">Unit preference</h2>
          <ul className="space-y-2">
            {unitCounts.map((u) => (
              <li key={u.label}>
                <Link
                  to={u.href}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-neutral-50"
                >
                  <span className="text-neutral-700">{u.label}</span>
                  <span className="font-semibold tabular-nums">{u.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Leasing-stage funnel */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold">Leasing stage</h2>
          <ul className="space-y-2">
            {stageCounts.map((s) => (
              <li key={s.label}>
                <Link to={s.href} className="block rounded-md p-1.5 hover:bg-neutral-50">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-neutral-700">{s.label}</span>
                    <span className="font-semibold tabular-nums">{s.count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full bg-neutral-800"
                      style={{ width: `${(s.count / stageMax) * 100}%` }}
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
