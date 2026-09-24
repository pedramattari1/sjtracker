import type { Prospect } from "@/lib/types";
import { STAGE_ORDER, TILES, UNIT_ORDER } from "@/lib/filters";

export interface SummaryRow {
  label: string;
  value: number;
}
export interface Summary {
  headline: (SummaryRow & { key: string })[];
  units: SummaryRow[];
  stages: SummaryRow[];
}

/**
 * Dashboard/report aggregates. Mirrors server/lib/summary.js exactly (a test
 * locks the two together). Built on the same TILES / STAGE_ORDER / UNIT_ORDER the
 * dashboard already used, so the dashboard's numbers are unchanged.
 */
export function buildSummary(records: Prospect[]): Summary {
  const headline = TILES.map((t) => ({
    key: t.key,
    label: t.label,
    value: records.filter(t.predicate).length,
  }));

  const units: SummaryRow[] = UNIT_ORDER.map((u) => ({
    label: u,
    value: records.filter((r) => r.unitpref === u).length,
  }));
  units.push({
    label: "Not indicated",
    value: records.filter((r) => !r.unitpref).length,
  });

  const stages: SummaryRow[] = STAGE_ORDER.map((s) => ({
    label: s,
    value: records.filter((r) => r.stage === s).length,
  }));

  return { headline, units, stages };
}
