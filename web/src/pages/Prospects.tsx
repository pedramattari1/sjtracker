import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  createProspect,
  deleteProspect,
  downloadProspectsCsv,
  fetchProspects,
  toInput,
  updateProspect,
} from "@/lib/api";
import type { Prospect, ProspectInput } from "@/lib/types";
import {
  applyControls,
  EMPTY_CONTROLS,
  resolveFilter,
  sortRows,
  type Controls,
  type SortCol,
} from "@/lib/filters";
import {
  STAGE_OPTIONS,
  STATUS_OPTIONS,
  STATUS_SHORT,
  TOURED_OPTIONS,
  UNIT_OPTIONS,
} from "@/lib/constants";
import { ProspectModal } from "@/components/ProspectModal";
import { cn } from "@/lib/utils";

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

const selectCls =
  "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400";

export function Prospects() {
  const { getToken } = useAuth();
  const token = useCallback(() => getToken(), [getToken]);
  const [searchParams] = useSearchParams();

  const [rows, setRows] = useState<Prospect[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  const [controls, setControls] = useState<Controls>(EMPTY_CONTROLS);
  const [sortCol, setSortCol] = useState<SortCol>("referred");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const modalOpenRef = useRef(false);
  modalOpenRef.current = modalOpen;

  const load = useCallback(async () => {
    try {
      const data = await fetchProspects(token);
      setRows(data);
      setError(null);
      setSyncedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (!modalOpenRef.current) void load();
    }, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const linkFilter = useMemo(() => resolveFilter(searchParams), [searchParams]);

  const setC = (k: keyof Controls, v: string) =>
    setControls((prev) => ({ ...prev, [k]: v }));

  const visible = useMemo(() => {
    let out = rows;
    if (linkFilter) out = out.filter(linkFilter.predicate);
    out = applyControls(out, controls);
    return sortRows(out, sortCol, sortDir);
  }, [rows, linkFilter, controls, sortCol, sortDir]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortCol(col);
      setSortDir(1);
    }
  }

  async function handleSave(rec: ProspectInput) {
    if (editing) await updateProspect(token, editing._id, rec);
    else await createProspect(token, rec);
    await load();
  }

  async function handleInlineStatus(row: Prospect, status: string) {
    // send the FULL record with only status changed, so no field is lost
    const next = { ...toInput(row), status };
    setRows((prev) =>
      prev.map((r) => (r._id === row._id ? { ...r, status } : r)),
    );
    try {
      await updateProspect(token, row._id, next);
      await load();
    } catch {
      await load(); // revert to server truth on failure
    }
  }

  async function handleDelete(row: Prospect) {
    if (!window.confirm(`Remove ${row.fname} ${row.lname}?`)) return;
    await deleteProspect(token, row._id);
    await load();
  }

  /** Build export params mirroring the current on-screen view (controls + deep-link). */
  function exportParams(): URLSearchParams {
    const p = new URLSearchParams();
    if (controls.search) p.set("search", controls.search);
    if (controls.status) p.set("status", controls.status);
    if (controls.unitpref) p.set("unitpref", controls.unitpref);
    if (controls.toured) p.set("toured", controls.toured);
    if (controls.stage) p.set("stage", controls.stage);
    const tile = searchParams.get("tile");
    if (tile) p.set("tile", tile);
    for (const k of ["status", "stage", "unitpref"] as const) {
      const v = searchParams.get(k);
      if (v && !p.has(k)) p.set(k, v);
    }
    return p;
  }

  async function handleExport() {
    try {
      await downloadProspectsCsv(token, exportParams());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Export failed");
    }
  }

  const th = "border-b border-neutral-200 px-3 py-2.5 text-left";
  const thSort = cn(th, "cursor-pointer select-none hover:bg-neutral-100");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Prospects</h1>
          <p className="text-xs text-neutral-500">
            {loading
              ? "Loading…"
              : error
                ? `Error: ${error}`
                : `${visible.length} of ${rows.length} prospects${syncedAt ? ` · synced ${syncedAt}` : ""}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-lg border border-neutral-300 px-3.5 py-2 text-sm font-medium hover:bg-neutral-50"
            onClick={() => void handleExport()}
          >
            Export CSV
          </button>
          <button
            className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            + Add prospect
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          placeholder="Search name or email…"
          value={controls.search}
          onChange={(e) => setC("search", e.target.value)}
        />
        <select className={selectCls} value={controls.status} onChange={(e) => setC("status", e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select className={selectCls} value={controls.unitpref} onChange={(e) => setC("unitpref", e.target.value)}>
          <option value="">All units</option>
          {UNIT_OPTIONS.filter((o) => o.value !== "").map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select className={selectCls} value={controls.toured} onChange={(e) => setC("toured", e.target.value)}>
          <option value="">All toured</option>
          {TOURED_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select className={selectCls} value={controls.stage} onChange={(e) => setC("stage", e.target.value)}>
          <option value="">All stages</option>
          {STAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {(controls.search || controls.status || controls.unitpref || controls.toured || controls.stage) ? (
          <button
            className="text-xs text-neutral-500 underline hover:text-neutral-800"
            onClick={() => setControls(EMPTY_CONTROLS)}
          >
            Reset filters
          </button>
        ) : null}
      </div>

      {/* Deep-link banner from Phase 2 */}
      {linkFilter ? (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
          <span className="text-neutral-600">
            Deep-link filter: <span className="font-medium text-neutral-900">{linkFilter.label}</span>
          </span>
          <Link to="/prospects" className="text-neutral-500 underline hover:text-neutral-800">Clear</Link>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[1080px] border-collapse">
          <thead>
            <tr className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <th className={thSort} onClick={() => toggleSort("name")}>Name ↕</th>
              <th className={th}>Email / phone</th>
              <th className={thSort} onClick={() => toggleSort("referred")}>Contacted ↕</th>
              <th className={th}>Responded</th>
              <th className={thSort} onClick={() => toggleSort("status")}>Status ↕</th>
              <th className={th}>Unit pref.</th>
              <th className={th}>Toured</th>
              <th className={thSort} onClick={() => toggleSort("stage")}>Leasing stage ↕</th>
              <th className={th}>Notes / feedback</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r._id} className="align-top hover:bg-neutral-50">
                <td className="border-b border-neutral-100 px-3 py-2.5 text-sm font-semibold">
                  {i + 1}. {r.fname} {r.lname}
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5 text-xs text-neutral-500">
                  {r.email || "—"}
                  {r.phone ? (<><br />{r.phone}</>) : null}
                </td>
                <td className="whitespace-nowrap border-b border-neutral-100 px-3 py-2.5 text-sm">
                  {fmtDate(r.referred)}
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                      r.responded === "yes" ? "bg-lime-100 text-lime-800" : "bg-neutral-100 text-neutral-600",
                    )}
                  >
                    {r.responded === "yes" ? "Yes" : "No"}
                  </span>
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5">
                  <select
                    className={cn(
                      "rounded-full border-0 px-2 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-sky-400",
                      STATUS_CLS[r.status] ?? "bg-sky-100 text-sky-800",
                    )}
                    value={r.status}
                    onChange={(e) => void handleInlineStatus(r, e.target.value)}
                    title="Change status"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{STATUS_SHORT[o.value] ?? o.label}</option>
                    ))}
                  </select>
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5 text-xs text-neutral-500">
                  {r.unitpref || "—"}
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5">
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold", TOURED_CLS[r.toured] ?? "bg-neutral-100 text-neutral-600")}>
                    {TOURED_LBL[r.toured] ?? r.toured}
                  </span>
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5 text-xs">{r.stage || "—"}</td>
                <td className="max-w-[240px] whitespace-pre-wrap border-b border-neutral-100 px-3 py-2.5 text-xs text-neutral-500">
                  {r.notes || "—"}
                </td>
                <td className="whitespace-nowrap border-b border-neutral-100 px-3 py-2.5">
                  <button
                    className="mr-1 rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
                    onClick={() => { setEditing(r); setModalOpen(true); }}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    onClick={() => void handleDelete(r)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!loading && visible.length === 0 && !error ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-sm text-neutral-400">
                  No prospects match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <ProspectModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
