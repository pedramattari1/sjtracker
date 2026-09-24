import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { MoreHorizontal } from "lucide-react";
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
import {
  PILL_BASE,
  PILL_SELECT_BASE,
  RESPONDED_CLS,
  stageCls,
  statusCls,
  touredCls,
} from "@/lib/badges";
import { syncTouredForStage } from "@/lib/prospectSync";
import { ProspectDrawer } from "@/components/ProspectDrawer";
import { cn } from "@/lib/utils";

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

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const drawerOpenRef = useRef(false);
  drawerOpenRef.current = drawerOpen;

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
      if (!drawerOpenRef.current) void load();
    }, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  // close the ⋯ menu on any outside click
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuId]);

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

  // Inline edit: build the FULL record (whole-object PUT), optimistic update, persist.
  async function inlineChange(row: Prospect, field: keyof ProspectInput, value: string) {
    let next: ProspectInput = { ...toInput(row), [field]: value };
    if (field === "stage") next = syncTouredForStage(next, false); // auto-sync toured
    setRows((prev) => prev.map((r) => (r._id === row._id ? { ...r, ...next } : r)));
    try {
      await updateProspect(token, row._id, next);
      await load();
    } catch {
      await load(); // revert to server truth
    }
  }

  async function handleSave(rec: ProspectInput) {
    if (editing) await updateProspect(token, editing._id, rec);
    else await createProspect(token, rec);
    await load();
  }

  async function handleDelete(row: Prospect) {
    if (!window.confirm(`Remove ${row.fname} ${row.lname}?`)) return;
    await deleteProspect(token, row._id);
    await load();
  }

  function openDrawer(row: Prospect | null) {
    setEditing(row);
    setDrawerOpen(true);
  }

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

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const th = "border-b border-neutral-200 px-3 py-2.5 text-left align-bottom";
  const thSort = cn(th, "cursor-pointer select-none hover:bg-neutral-200/60");
  const filtersActive =
    controls.search || controls.status || controls.unitpref || controls.toured || controls.stage;

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
            onClick={() => openDrawer(null)}
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
          {STATUS_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
        <select className={selectCls} value={controls.unitpref} onChange={(e) => setC("unitpref", e.target.value)}>
          <option value="">All units</option>
          {UNIT_OPTIONS.filter((o) => o.value !== "").map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
        <select className={selectCls} value={controls.toured} onChange={(e) => setC("toured", e.target.value)}>
          <option value="">All toured</option>
          {TOURED_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
        <select className={selectCls} value={controls.stage} onChange={(e) => setC("stage", e.target.value)}>
          <option value="">All stages</option>
          {STAGE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
        {filtersActive ? (
          <button className="text-xs text-neutral-500 underline hover:text-neutral-800" onClick={() => setControls(EMPTY_CONTROLS)}>
            Reset filters
          </button>
        ) : null}
      </div>

      {linkFilter ? (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
          <span className="text-neutral-600">
            Deep-link filter: <span className="font-medium text-neutral-900">{linkFilter.label}</span>
          </span>
          <Link to="/prospects" className="text-neutral-500 underline hover:text-neutral-800">Clear</Link>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[1120px] border-collapse text-sm">
          <colgroup>
            <col style={{ width: "17%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "44px" }} />
          </colgroup>
          <thead>
            <tr className="sticky top-0 z-10 bg-neutral-100 text-[11px] uppercase tracking-wide text-neutral-500">
              <th className={thSort} onClick={() => toggleSort("name")}>Name ↕</th>
              <th className={th}>Email / phone</th>
              <th className={cn(thSort, "whitespace-nowrap")} onClick={() => toggleSort("referred")}>Contacted ↕</th>
              <th className={th}>Responded</th>
              <th className={thSort} onClick={() => toggleSort("status")}>Status ↕</th>
              <th className={th}>Unit</th>
              <th className={th}>Toured</th>
              <th className={cn(thSort, "whitespace-nowrap")} onClick={() => toggleSort("stage")}>Stage ↕</th>
              <th className={th}>Notes</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                key={r._id}
                onClick={() => openDrawer(r)}
                className={cn(
                  "cursor-pointer align-top",
                  i % 2 === 1 ? "bg-neutral-50/60" : "bg-white",
                  "hover:bg-sky-50",
                )}
              >
                <td className="border-b border-neutral-100 px-3 py-2.5 font-semibold">
                  {i + 1}. {r.fname} {r.lname}
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5 text-xs text-neutral-500">
                  {r.email || "—"}
                  {r.phone ? (<><br />{r.phone}</>) : null}
                </td>
                <td className="whitespace-nowrap border-b border-neutral-100 px-3 py-2.5">
                  {fmtDate(r.referred)}
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5">
                  <span className={cn(PILL_BASE, r.responded === "yes" ? RESPONDED_CLS.yes : RESPONDED_CLS.no)}>
                    {r.responded === "yes" ? "Yes" : "No"}
                  </span>
                </td>
                {/* inline Status */}
                <td className="border-b border-neutral-100 px-3 py-2.5" onClick={stop}>
                  <select
                    className={cn(PILL_SELECT_BASE, statusCls(r.status))}
                    value={r.status}
                    onChange={(e) => void inlineChange(r, "status", e.target.value)}
                    title="Change status"
                  >
                    {STATUS_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{STATUS_SHORT[o.value] ?? o.label}</option>))}
                  </select>
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5 text-xs text-neutral-500">
                  {r.unitpref || "—"}
                </td>
                {/* inline Toured */}
                <td className="border-b border-neutral-100 px-3 py-2.5" onClick={stop}>
                  <select
                    className={cn(PILL_SELECT_BASE, touredCls(r.toured))}
                    value={r.toured}
                    onChange={(e) => void inlineChange(r, "toured", e.target.value)}
                    title="Change toured"
                  >
                    {TOURED_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </td>
                {/* inline Stage */}
                <td className="border-b border-neutral-100 px-3 py-2.5" onClick={stop}>
                  <select
                    className={cn(PILL_SELECT_BASE, stageCls(r.stage))}
                    value={r.stage}
                    onChange={(e) => void inlineChange(r, "stage", e.target.value)}
                    title="Change leasing stage"
                  >
                    {STAGE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </td>
                <td className="border-b border-neutral-100 px-3 py-2.5 text-xs text-neutral-500">
                  <span className="line-clamp-2" title={r.notes}>{r.notes || "—"}</span>
                </td>
                {/* actions ⋯ */}
                <td className="border-b border-neutral-100 px-2 py-2.5 text-right" onClick={stop}>
                  <div className="relative inline-block">
                    <button
                      className="rounded-md p-1 text-neutral-500 hover:bg-neutral-200"
                      onClick={() => setMenuId(menuId === r._id ? null : r._id)}
                      aria-label="Row actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuId === r._id ? (
                      <div className="absolute right-0 z-20 mt-1 w-28 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                        <button
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                          onClick={() => { setMenuId(null); openDrawer(r); }}
                        >
                          Edit
                        </button>
                        <button
                          className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                          onClick={() => { setMenuId(null); void handleDelete(r); }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
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

      <ProspectDrawer
        open={drawerOpen}
        initial={editing}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
