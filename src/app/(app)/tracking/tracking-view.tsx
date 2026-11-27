"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, RotateCcw, Search } from "lucide-react";
import { BAND_CLASS, BAND_LABEL, OfferResultText, TatBadge } from "@/components/aging-badge";
import { ExportLink } from "@/components/export-link";
import { hasPeople, PeopleFilters } from "@/components/people-filters";
import { StatusBadge } from "@/components/status-badge";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { formatThaiDate } from "@/lib/domain/dates";
import { peopleOptions, type BranchHead, type PeopleFilter } from "@/lib/domain/people";
import type { AgingBand } from "@/lib/domain/tat";
import { filterTrackingRows, type TrackingRow, type TrackingStatusFilter as StatusFilter } from "@/lib/domain/tracking";
import { cn } from "@/lib/utils";
import { BranchTaDialog, type BranchTaTarget } from "./branch-ta-dialog";
import { RequisitionDialog, type DialogTarget, type EditContext } from "./requisition-dialogs";

interface Props {
  rows: TrackingRow[];
  /** Keyed by branch code. */
  branches: Record<string, BranchHead>;
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


/** The planned start date has passed but HR has not issued an employee ID yet, so the position is still on Offer. */
function StartOverdue() {
  return <span className="mt-1 block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">เลยวันเริ่มงานแล้ว ยังไม่มีรหัสพนักงาน</span>;
}

/** Colour strip at the left edge of a row: aging band while open, green-ish once an Offer exists. */
function AgingBar({ row }: { row: TrackingRow }) {
  return <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", row.agingBand ? BAND_CLASS[row.agingBand] : "bg-primary/45")} />;
}

function RequestDate({ row }: { row: TrackingRow }) {
  if (row.upcoming) {
    return (
      <span className="text-xs">
        {formatThaiDate(row.requestDate)}
        <span className="mt-1 block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">ยังไม่ถึงวันว่าง</span>
      </span>
    );
  }
  return <span className="text-xs tabular-nums">{formatThaiDate(row.requestDate)}</span>;
}

/** What a row's action does for this viewer: fill an Offer, record a turndown, edit; null when there is nothing to do. */
function modeOf(row: TrackingRow, isAdmin: boolean) {
  return !row.canEdit ? null : row.status === "Vacancy" ? "offer" : row.status === "Offer" ? "turndown" : isAdmin ? "edit" : null;
}

/** Props that make a whole row do what its action button does (the button stays for keyboards and screen readers). */
function rowAction(row: TrackingRow, isAdmin: boolean, onOpen: (t: DialogTarget) => void) {
  const mode = modeOf(row, isAdmin);
  if (!mode) return {};
  return {
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      // A click on a control inside the row (the action button itself) does that control's job, not this one.
      const control = (e.target as HTMLElement).closest("button, a, input, select, textarea");
      if (control && e.currentTarget.contains(control)) return;
      onOpen({ mode, row });
    },
  };
}

/** Status badge plus, for rows the viewer can act on, a visible action button. */
function StatusCell({ row, onOpen, isAdmin }: { row: TrackingRow; onOpen: (t: DialogTarget) => void; isAdmin: boolean }) {
  const mode = modeOf(row, isAdmin);
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

export function TrackingView({ rows, branches, mineOnly, canFilterMine, editContext, initialBand = null, initialQ = "", initialBu = "" }: Props) {
  const [target, setTarget] = useState<DialogTarget>(null);
  const [taTarget, setTaTarget] = useState<BranchTaTarget | null>(null);
  const [region, setRegion] = useState("");
  const [bu, setBu] = useState(initialBu);
  const [status, setStatus] = useState<StatusFilter>("");
  const [q, setQ] = useState(initialQ);
  const [band, setBand] = useState<AgingBand | null>(initialBand);
  // Request date (วันที่แจ้งสรรหา); null = every date.
  const [range, setRange] = useState<DateRangeValue>(null);
  const [people, setPeople] = useState<PeopleFilter>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const regions = useMemo(() => [...new Set(rows.map((r) => r.region))], [rows]);
  const bus = useMemo(() => [...new Set(rows.map((r) => r.bu))].sort((a, b) => a.localeCompare(b, "th")), [rows]);
  const peopleChoices = useMemo(() => peopleOptions(rows), [rows]);
  // Band counts come from rows before the band filter so the chips stay stable while you pick one.
  // Everything but the band; the band chips count from this so they stay stable while one is picked.
  const filter = { bu: bu || undefined, region: region || undefined, status: status || undefined, q: q.trim() || undefined, from: range?.from, to: range?.to, ...people };
  const base = useMemo(() => filterTrackingRows(rows, filter), [rows, bu, region, status, q, range, people]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => (band ? base.filter((r) => r.agingBand === band) : base), [base, band]);
  const exportHref = `/api/export/tracking?${new URLSearchParams(Object.entries({ ...filter, band: band ?? undefined, mine: canFilterMine ? (mineOnly ? "1" : "0") : undefined }).filter((e): e is [string, string] => Boolean(e[1])))}`;
  const groups = useMemo(() => groupByBranch(filtered), [filtered]);

  const offered = filtered.filter((r) => r.status === "Offer").length;
  const notMeet = filtered.filter((r) => r.tatResult === "NotMeet").length;
  const openNow = filtered.filter((r) => r.agingBand !== null);
  const avgAging = openNow.length ? Math.round(openNow.reduce((s, r) => s + r.tat, 0) / openNow.length) : null;
  const bandCount = (b: AgingBand) => base.filter((r) => r.agingBand === b).length;

  const hasFilter = bu !== "" || region !== "" || status !== "" || q !== "" || band !== null || range !== null || hasPeople(people);
  const clearFilters = () => {
    setRegion("");
    setBu("");
    setStatus("");
    setQ("");
    setBand(null);
    setRange(null);
    setPeople({});
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
          <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
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
        <ExportLink href={exportHref} />
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
          <PeopleFilters idPrefix="trk" value={people} onChange={setPeople} options={peopleChoices} />
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
            <div className="flex items-center">
              <h2 className="min-w-0 flex-1">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panel}
                  onClick={() => toggle(g.key)}
                  className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3.5 text-left outline-none hover:bg-black/[0.02] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                >
                  <span className="flex min-w-0 items-center gap-2.5 font-heading text-sm font-medium">
                    <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                    {/* Full shop name as in Branches: wraps instead of being cut off. */}
                    <span className="min-w-0 break-words">
                      {g.branchName}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="px-1">
                      AM {branches[g.branchCode]?.am || "-"} <span aria-hidden>·</span> RM {branches[g.branchCode]?.rm || "-"} <span aria-hidden>·</span> TA {branches[g.branchCode]?.taName || "-"}
                    </span>
                    <span className="rounded-full bg-black/5 px-2.5 py-0.5">{g.region}</span>
                    {g.province && g.province !== g.region && <span className="rounded-full bg-black/5 px-2.5 py-0.5">{g.province}</span>}
                    <span className="rounded-full bg-ink-chip px-2.5 py-0.5 text-white">{g.rows.length} ตำแหน่ง</span>
                  </span>
                </button>
              </h2>
              {editContext.canChangeBranchTa && branches[g.branchCode]?.known && (
                <button
                  type="button"
                  onClick={() => setTaTarget({ branchCode: g.branchCode, branchName: g.branchName, head: branches[g.branchCode] })}
                  aria-label={`เปลี่ยน TA ของ ${g.branchName}`}
                  className="mr-4 h-7 shrink-0 rounded-full bg-white px-3 text-xs font-medium ring-1 ring-border outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  เปลี่ยน TA
                </button>
              )}
            </div>

            {open && (
              <div id={panel}>
                {/* Desktop table */}
                <table className="hidden w-full table-fixed text-left md:table">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-y border-black/[0.06] bg-black/[0.025]">
                      <th className="w-[24%] py-2 pr-5 pl-6 font-medium">ตำแหน่ง</th>
                      <th className="w-[15%] px-5 py-2 font-medium">วันที่แจ้งสรรหา</th>
                      <th className="w-[11%] px-5 py-2 font-medium">TAT</th>
                      <th className="w-[11%] px-5 py-2 font-medium">Result</th>
                      <th className="w-[25%] px-5 py-2 font-medium">สถานะ</th>
                      <th className="w-[14%] px-5 py-2 font-medium">TA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr
                        key={r.id}
                        className={cn("border-b border-black/[0.05] transition-colors last:border-0 hover:bg-black/[0.02]", modeOf(r, editContext.isAdmin) && "cursor-pointer")}
                        {...rowAction(r, editContext.isAdmin, setTarget)}
                      >
                        <td className="relative py-3 pr-5 pl-6">
                          <AgingBar row={r} />
                          <div className="text-sm font-medium">{r.positionName}</div>
                          {r.offerName && (
                            <div className="text-xs text-muted-foreground">
                              <span className="text-foreground/80">{r.offerName}</span>
                              <span className="block">Offer {formatThaiDate(r.offerDate)}{r.offer?.startDate && <> · เริ่มงาน {formatThaiDate(r.offer.startDate)}</>}</span>
                              {r.startOverdue && <StartOverdue />}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <RequestDate row={r} />
                        </td>
                        <td className="px-5 py-3">
                          <TatBadge tat={r.tat} band={r.agingBand} small />
                        </td>
                        <td className="px-5 py-3">
                          <OfferResultText result={r.tatResult} offered={r.offerDate !== null} />
                        </td>
                        <td className="px-5 py-3">
                          <StatusCell row={r} onOpen={setTarget} isAdmin={editContext.isAdmin} />
                        </td>
                        <td className="px-5 py-3 text-xs">{r.taName || <span className="text-muted-foreground">ยังไม่มีเจ้าของ</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile cards */}
                <ul className="divide-y divide-black/[0.06] border-t border-black/[0.06] md:hidden">
                  {g.rows.map((r) => (
                    <li key={r.id} className={cn("relative flex items-start justify-between gap-3 py-3 pr-5 pl-6", modeOf(r, editContext.isAdmin) && "cursor-pointer")} {...rowAction(r, editContext.isAdmin, setTarget)}>
                      <AgingBar row={r} />
                      <div className="min-w-0 space-y-1">
                        <div className="text-sm font-medium">{r.positionName}</div>
                        <div className="text-xs text-muted-foreground">
                          แจ้งสรรหา <RequestDate row={r} />
                        </div>
                        {r.offerName && (
                          <div className="text-xs text-muted-foreground">
                            <span className="text-foreground/80">{r.offerName}</span>
                            <span className="block">Offer {formatThaiDate(r.offerDate)}{r.offer?.startDate && <> · เริ่มงาน {formatThaiDate(r.offer.startDate)}</>}</span>
                            {r.startOverdue && <StartOverdue />}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <StatusCell row={r} onOpen={setTarget} isAdmin={editContext.isAdmin} />
                        </div>
                        <div className="text-xs text-muted-foreground">TA: {r.taName || "ยังไม่มีเจ้าของ"}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <TatBadge tat={r.tat} band={r.agingBand} small />
                        <OfferResultText result={r.tatResult} offered={r.offerDate !== null} />
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
      <BranchTaDialog target={taTarget} names={editContext.taNames} onClose={() => setTaTarget(null)} />
    </div>
  );
}
