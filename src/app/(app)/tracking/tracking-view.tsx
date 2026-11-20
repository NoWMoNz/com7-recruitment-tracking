"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, RotateCcw, Search } from "lucide-react";
import { BAND_CLASS, BAND_LABEL, TatBadge, TatResultText } from "@/components/aging-badge";
import { StatusBadge } from "@/components/status-badge";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { formatThaiDate } from "@/lib/domain/dates";
import type { AgingBand } from "@/lib/domain/tat";
import type { TrackingRow } from "@/lib/domain/tracking";
import { cn } from "@/lib/utils";
import { RequisitionDialog, type DialogTarget, type EditContext } from "./requisition-dialogs";

interface Props {
  rows: TrackingRow[];
  today: string;
  mineOnly: boolean;
  canFilterMine: boolean;
  editContext: EditContext;
  /** Aging band preselected from the URL (links from the dashboard). */
  initialBand?: AgingBand | null;
  /** Search text preset from the URL (links from the dashboard). */
  initialQ?: string;
  /** Business unit preset from the URL (links from the dashboard). */
  initialBu?: string;
}

interface BranchGroup {
  key: string;
  region: string;
  branchName: string;
  branchCode: string;
  province: string;
  rows: TrackingRow[];
}

type StatusFilter = "" | "Vacancy" | "Offer" | "Pending";

const BANDS: AgingBand[] = ["green", "orange", "red", "darkred"];
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "ทุกสถานะ" },
  { value: "Vacancy", label: "ว่าง" },
  { value: "Offer", label: "Offer แล้ว" },
  { value: "Pending", label: "รออนุมัติ" },
];

const SELECT = "h-10 min-w-0 rounded-full border border-input bg-white px-3.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function groupByBranch(rows: TrackingRow[]): BranchGroup[] {
  const groups = new Map<string, BranchGroup>();
  for (const r of rows) {
    const key = `${r.region}|${r.branchCode}`;
    if (!groups.has(key)) {
      groups.set(key, { key, region: r.region, branchName: r.branchName, branchCode: r.branchCode, province: r.province, rows: [] });
    }
    groups.get(key)!.rows.push(r);
  }
  return [...groups.values()];
}

function matches(r: TrackingRow, q: string): boolean {
  if (!q) return true;
  const hay = `${r.branchName} ${r.branchCode} ${r.positionName} ${r.taName} ${r.province} ${r.offerName ?? ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

const matchesStatus = (r: TrackingRow, s: StatusFilter) => !s || (s === "Pending" ? r.status === "PendingCancel" || r.status === "PendingHold" : r.status === s);

/** Colour strip at the left edge of a row: aging band while open, green-ish once an Offer exists. */
function AgingBar({ row }: { row: TrackingRow }) {
  return <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", row.agingBand ? BAND_CLASS[row.agingBand] : "bg-primary/45")} />;
}

function RequestDate({ row }: { row: TrackingRow }) {
  if (row.upcoming) {
    return (
      <span className="text-sm">
        {formatThaiDate(row.requestDate)}
        <span className="mt-1 block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">ยังไม่ถึงวันว่าง</span>
      </span>
    );
  }
  return <span className="text-sm tabular-nums">{formatThaiDate(row.requestDate)}</span>;
}

/** Status badge plus, for rows the viewer can act on, a visible action button. */
function StatusCell({ row, onOpen, isAdmin }: { row: TrackingRow; onOpen: (t: DialogTarget) => void; isAdmin: boolean }) {
  const mode = !row.canEdit ? null : row.status === "Vacancy" ? "offer" : row.status === "Offer" ? "turndown" : isAdmin ? "edit" : null;
  const label = mode === "offer" ? "กรอก Offer" : mode === "turndown" ? "ดู / Turndown" : "แก้ไข";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusBadge status={row.status} />
      {mode && (
        <button
          type="button"
          onClick={() => onOpen({ mode, row })}
          aria-label={`${label} ${row.positionName} ${row.branchName}`}
          className={cn(
            "inline-flex h-7 items-center gap-0.5 rounded-full px-3 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            mode === "offer" ? "bg-ink-chip text-white hover:bg-ink-chip/85" : "bg-white text-foreground ring-1 ring-border hover:bg-muted",
          )}
        >
          {label}
          <ChevronRight className="size-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

export function TrackingView({ rows, mineOnly, canFilterMine, editContext, initialBand = null, initialQ = "", initialBu = "" }: Props) {
  const [target, setTarget] = useState<DialogTarget>(null);
  const [region, setRegion] = useState("");
  const [bu, setBu] = useState(initialBu);
  const [status, setStatus] = useState<StatusFilter>("");
  const [q, setQ] = useState(initialQ);
  const [band, setBand] = useState<AgingBand | null>(initialBand);
  // Request date (วันที่แจ้งสรรหา); null = every date.
  const [range, setRange] = useState<DateRangeValue>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const regions = useMemo(() => [...new Set(rows.map((r) => r.region))], [rows]);
  const bus = useMemo(() => [...new Set(rows.map((r) => r.bu))].sort((a, b) => a.localeCompare(b, "th")), [rows]);
  // Band counts come from rows before the band filter so the chips stay stable while you pick one.
  const base = useMemo(() => rows.filter((r) => (!bu || r.bu === bu) && (!region || r.region === region) && matchesStatus(r, status) && matches(r, q.trim()) && (!range || (r.requestDate >= range.from && r.requestDate <= range.to))), [rows, bu, region, status, q, range]);
  const filtered = useMemo(() => (band ? base.filter((r) => r.agingBand === band) : base), [base, band]);
  const groups = useMemo(() => groupByBranch(filtered), [filtered]);

  const offered = filtered.filter((r) => r.status === "Offer").length;
  const notMeet = filtered.filter((r) => r.tatResult === "NotMeet").length;
  const openNow = filtered.filter((r) => r.agingBand !== null);
  const avgAging = openNow.length ? Math.round(openNow.reduce((s, r) => s + r.tat, 0) / openNow.length) : null;
  const bandCount = (b: AgingBand) => base.filter((r) => r.agingBand === b).length;

  const hasFilter = bu !== "" || region !== "" || status !== "" || q !== "" || band !== null || range !== null;
  const clearFilters = () => {
    setRegion("");
    setBu("");
    setStatus("");
    setQ("");
    setBand(null);
    setRange(null);
  };
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key));
  const toggle = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (!n.delete(key)) n.add(key);
      return n;
    });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="font-heading text-3xl font-light">ติดตามการสรรหา</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            <b className="font-medium text-foreground">{filtered.length}</b> ตำแหน่ง
            {groups.length > 0 && <> ใน {groups.length} สาขา</>}
            <span aria-hidden> · </span>Offer แล้ว <b className="font-medium text-foreground">{offered}</b>
            <span aria-hidden> · </span>เกินเกณฑ์ TAT <b className={cn("font-medium", notMeet ? "text-[#b91c1c]" : "text-foreground")}>{notMeet}</b>
            {avgAging !== null && (
              <>
                <span aria-hidden> · </span>ว่างค้างเฉลี่ย <b className="font-medium text-foreground">{avgAging}</b> วัน
              </>
            )}
          </p>
        </div>
        {canFilterMine && (
          <div role="group" aria-label="มุมมองตำแหน่ง" className="inline-flex gap-1 rounded-full bg-muted p-1">
            {[
              { value: "1", label: "ของฉัน", href: "/tracking?mine=1" },
              { value: "0", label: "ทั้งหมด", href: "/tracking?mine=0" },
            ].map((o) => {
              const active = (mineOnly ? "1" : "0") === o.value;
              return (
                <Link
                  key={o.value}
                  href={o.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("rounded-full px-4 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", active ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {o.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Filters stay in view while the list scrolls. */}
      <div className="z-20 space-y-2 md:sticky md:top-3 rounded-3xl bg-white/90 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_30px_rgba(0,0,0,0.08)] ring-1 ring-black/5 backdrop-blur-xl lg:top-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสาขา ตำแหน่ง หรือ TA"
              aria-label="ค้นหา"
              className={cn(SELECT, "w-full pl-10 placeholder:text-muted-foreground")}
            />
          </div>
          <label className="sr-only" htmlFor="trk-bu">
            BU
          </label>
          <Dropdown id="trk-bu" variant="pill" value={bu} onChange={setBu} emptyLabel="ทุก BU" options={bus.map((b) => ({ value: b, label: b }))} className="w-36" />
          <label className="sr-only" htmlFor="trk-region">
            ภาค
          </label>
          <Dropdown id="trk-region" variant="pill" value={region} onChange={setRegion} emptyLabel="ทุกภาค" options={regions.map((r) => ({ value: r, label: r }))} className="w-36" />
          <label className="sr-only" htmlFor="trk-status">
            สถานะ
          </label>
          <Dropdown id="trk-status" variant="pill" value={status} onChange={(v) => setStatus(v as StatusFilter)} emptyLabel="ทุกสถานะ" options={STATUS_OPTIONS.filter((o) => o.value).map((o) => ({ value: o.value, label: o.label }))} className="w-40" />
          <label className="sr-only" htmlFor="trk-range">
            วันที่แจ้งสรรหา
          </label>
          <DateRangePicker id="trk-range" allowAll allLabel="ทุกวันที่แจ้งสรรหา" value={range} onChange={setRange} aria-label="วันที่แจ้งสรรหา" className="w-64" />
        </div>
        <div className="flex items-center gap-2">
          <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none]" aria-label="กรองตามจำนวนวันที่ค้าง">
            {BANDS.map((b) => (
              <li key={b} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={band === b}
                  onClick={() => setBand(band === b ? null : b)}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    band === b ? "bg-ink-chip text-white" : "bg-muted hover:bg-black/[0.07]",
                  )}
                >
                  <span aria-hidden className={cn("size-2.5 rounded-full", BAND_CLASS[b])} />
                  {BAND_LABEL[b]}
                  <span className="font-heading tabular-nums opacity-70">{bandCount(b)}</span>
                </button>
              </li>
            ))}
          </ul>
          {hasFilter && (
            <button type="button" onClick={clearFilters} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted">
              <RotateCcw className="size-3.5" aria-hidden />
              ล้างตัวกรอง
            </button>
          )}
          {groups.length > 1 && (
            <button
              type="button"
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))}
              className="hidden h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted sm:inline-flex"
            >
              {allCollapsed ? <ChevronsUpDown className="size-3.5" aria-hidden /> : <ChevronsDownUp className="size-3.5" aria-hidden />}
              {allCollapsed ? "ขยายทุกสาขา" : "พับทุกสาขา"}
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 && (
        <p className="rounded-3xl bg-muted/60 py-12 text-center text-muted-foreground">{rows.length === 0 ? "ยังไม่มีตำแหน่งที่กำลังสรรหา" : "ไม่มีตำแหน่งที่ตรงกับเงื่อนไข ลองกด “ล้างตัวกรอง”"}</p>
      )}

      {groups.map((g) => {
        const open = !collapsed.has(g.key);
        const panel = `branch-${g.key.replace(/\W/g, "_")}`;
        return (
          <section key={g.key} className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
            <h2>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panel}
                onClick={() => toggle(g.key)}
                className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3.5 text-left outline-none hover:bg-black/[0.02] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
              >
                <span className="flex min-w-0 items-center gap-2.5 font-heading font-medium">
                  <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                  <span className="truncate">
                    {g.branchName} <span className="font-sans text-sm font-normal text-muted-foreground">{g.branchCode}</span>
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="rounded-full bg-black/5 px-2.5 py-0.5">{g.region}</span>
                  {g.province && g.province !== g.region && <span className="rounded-full bg-black/5 px-2.5 py-0.5">{g.province}</span>}
                  <span className="rounded-full bg-ink-chip px-2.5 py-0.5 text-white">{g.rows.length} ตำแหน่ง</span>
                </span>
              </button>
            </h2>

            {open && (
              <div id={panel}>
                {/* Desktop table */}
                <table className="hidden w-full table-fixed text-left md:table">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-y border-black/[0.06] bg-black/[0.025]">
                      <th className="w-[24%] py-2 pr-5 pl-6 font-medium">ตำแหน่ง</th>
                      <th className="w-[15%] px-5 py-2 font-medium">วันที่แจ้งสรรหา</th>
                      <th className="w-[11%] px-5 py-2 font-medium">TAT</th>
                      <th className="w-[11%] px-5 py-2 font-medium">ผล TAT</th>
                      <th className="w-[25%] px-5 py-2 font-medium">สถานะ</th>
                      <th className="w-[14%] px-5 py-2 font-medium">TA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.id} className="border-b border-black/[0.05] transition-colors last:border-0 hover:bg-black/[0.02]">
                        <td className="relative py-3 pr-5 pl-6">
                          <AgingBar row={r} />
                          <div className="text-sm font-medium">{r.positionName}</div>
                          {r.offerName && (
                            <div className="text-xs text-muted-foreground">
                              <span className="text-foreground/80">{r.offerName}</span>
                              <span className="block">Offer {formatThaiDate(r.offerDate)}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <RequestDate row={r} />
                        </td>
                        <td className="px-5 py-3">
                          <TatBadge tat={r.tat} band={r.agingBand} />
                        </td>
                        <td className="px-5 py-3">
                          <TatResultText result={r.tatResult} />
                        </td>
                        <td className="px-5 py-3">
                          <StatusCell row={r} onOpen={setTarget} isAdmin={editContext.isAdmin} />
                        </td>
                        <td className="px-5 py-3 text-sm">{r.taName || <span className="text-muted-foreground">ยังไม่มีเจ้าของ</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile cards */}
                <ul className="divide-y divide-black/[0.06] border-t border-black/[0.06] md:hidden">
                  {g.rows.map((r) => (
                    <li key={r.id} className="relative flex items-start justify-between gap-3 py-3 pr-5 pl-6">
                      <AgingBar row={r} />
                      <div className="min-w-0 space-y-1">
                        <div className="font-medium">{r.positionName}</div>
                        <div className="text-xs text-muted-foreground">
                          แจ้งสรรหา <RequestDate row={r} />
                        </div>
                        {r.offerName && (
                          <div className="text-xs text-muted-foreground">
                            <span className="text-foreground/80">{r.offerName}</span>
                            <span className="block">Offer {formatThaiDate(r.offerDate)}</span>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <StatusCell row={r} onOpen={setTarget} isAdmin={editContext.isAdmin} />
                        </div>
                        <div className="text-xs text-muted-foreground">TA: {r.taName || "ยังไม่มีเจ้าของ"}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <TatBadge tat={r.tat} band={r.agingBand} />
                        <TatResultText result={r.tatResult} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}

      <RequisitionDialog target={target} ctx={editContext} onClose={() => setTarget(null)} />
    </div>
  );
}
