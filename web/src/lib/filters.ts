import type { Prospect } from "@/lib/types";

// Stages that count as "Applying / leased" (same as the current app).
export const APPLYING_STAGES = [
  "Application in progress",
  "Application submitted",
  "Lease signed",
];

// Leasing stages in funnel order.
export const STAGE_ORDER = [
  "Initial outreach",
  "Scheduling call / tour",
  "Tour scheduled",
  "Tour completed",
  "Application in progress",
  "Application submitted",
  "Lease signed",
  "Not proceeding",
];

// Unit-preference buckets in display order. "" (not indicated) handled separately.
export const UNIT_ORDER = [
  "Studio",
  "1 Bedroom",
  "2 Bedroom",
  "1BR or 2BR",
  "TBD",
];
export const UNIT_NONE = "__none__"; // sentinel for empty unitpref in URLs

export type TileKey = "total" | "responded" | "tour" | "follow" | "applying";

// Status-tile definitions — same predicates as the current app's summary.
export const TILES: {
  key: TileKey;
  label: string;
  predicate: (r: Prospect) => boolean;
}[] = [
  { key: "total", label: "Total prospects", predicate: () => true },
  { key: "responded", label: "Responded", predicate: (r) => r.responded === "yes" },
  {
    key: "tour",
    label: "Tour sched. / done",
    predicate: (r) => r.toured === "yes" || r.toured === "scheduled",
  },
  {
    key: "follow",
    label: "Need follow-up",
    predicate: (r) => r.status === "follow" || r.status === "cold",
  },
  {
    key: "applying",
    label: "Applying / leased",
    predicate: (r) => APPLYING_STAGES.includes(r.stage),
  },
];

const TILE_BY_KEY = new Map(TILES.map((t) => [t.key, t]));

// ---- Phase 3: combinable filter controls (pure, testable) ----
export interface Controls {
  search: string; // matches name or email (case-insensitive)
  status: string; // "" = all
  unitpref: string; // "" = all (matches "Not indicated" when set to "__none__")
  toured: string; // "" = all
  stage: string; // "" = all
}

export const EMPTY_CONTROLS: Controls = {
  search: "",
  status: "",
  unitpref: "",
  toured: "",
  stage: "",
};

/** Apply all active controls with AND semantics. */
export function applyControls(rows: Prospect[], c: Controls): Prospect[] {
  const q = c.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (c.status && r.status !== c.status) return false;
    if (c.toured && r.toured !== c.toured) return false;
    if (c.stage && r.stage !== c.stage) return false;
    if (c.unitpref) {
      if (c.unitpref === UNIT_NONE ? r.unitpref !== "" : r.unitpref !== c.unitpref)
        return false;
    }
    if (q) {
      const hay = `${r.fname} ${r.lname} ${r.email}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type SortCol = "name" | "referred" | "status" | "stage";

/** Stable-ish sort by a column; returns a new array. */
export function sortRows(
  rows: Prospect[],
  col: SortCol,
  dir: 1 | -1,
): Prospect[] {
  return rows.slice().sort((a, b) => {
    let av = "";
    let bv = "";
    if (col === "name") {
      av = `${a.lname}${a.fname}`.toLowerCase();
      bv = `${b.lname}${b.fname}`.toLowerCase();
    } else if (col === "referred") {
      av = a.referred || "";
      bv = b.referred || "";
    } else if (col === "status") {
      av = a.status;
      bv = b.status;
    } else {
      av = a.stage;
      bv = b.stage;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

/** Resolve a Prospects filter from URL params. Returns predicate + label, or
 *  null when there is no active filter. Single-filter only (Phase 2 deep-links);
 *  the full combinable filter UI is Phase 3. */
export function resolveFilter(
  params: URLSearchParams,
): { predicate: (r: Prospect) => boolean; label: string } | null {
  const tile = params.get("tile");
  if (tile && TILE_BY_KEY.has(tile as TileKey) && tile !== "total") {
    const t = TILE_BY_KEY.get(tile as TileKey)!;
    return { predicate: t.predicate, label: t.label };
  }
  const status = params.get("status");
  if (status) {
    return { predicate: (r) => r.status === status, label: `Status: ${status}` };
  }
  const stage = params.get("stage");
  if (stage) {
    return { predicate: (r) => r.stage === stage, label: `Stage: ${stage}` };
  }
  const unit = params.get("unitpref");
  if (unit === UNIT_NONE) {
    return { predicate: (r) => !r.unitpref, label: "Unit: Not indicated" };
  }
  if (unit) {
    return { predicate: (r) => r.unitpref === unit, label: `Unit: ${unit}` };
  }
  return null;
}
