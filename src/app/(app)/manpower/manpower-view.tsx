"use client";

import { Fragment, useId, useMemo, useState } from "react";
import { ChevronRight, Download, RotateCcw, Search } from "lucide-react";
import { hasPeople, PeopleFilters } from "@/components/people-filters";
import { Dropdown } from "@/components/ui/dropdown";
import { formatThaiDate } from "@/lib/domain/dates";
import { peopleOptions, type PeopleFilter } from "@/lib/domain/people";
import {
  filterManpowerRows,
  MANPOWER_STATUS_LABEL,
  OPEN_MATCH_LABEL,
  summarizeManpower,
  type ManpowerRow,
  type ManpowerStatus,
  type OpenMatch,
} from "@/lib/domain/manpower";
import { cn } from "@/lib/utils";

const CARD = "rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5";
const STATUS_CHIP: Record<ManpowerStatus, string> = {
  short: "bg-red-100 text-[#b91c1c]",
  over: "bg-amber-100 text-amber-900",
  full: "bg-[#1f9d55]/12 text-[#177a43]",
};
const MATCH_CHIP: Record<OpenMatch, string> = {
  match: "bg-black/[0.05] text-foreground/70",
  fewer: "bg-amber-100 text-amber-900",
  more: "bg-sky-100 text-sky-900",
};
const MATCH_HINT: Record<OpenMatch, string> = {
  match: "จำนวนที่เปิดสรรหาในระบบเท่ากับที่ HR บอกว่าขาด",
  fewer: "ระบบเปิดสรรหาน้อยกว่าที่ HR บอกว่าขาด อาจยังเปิดตำแหน่งไม่ครบ",
  more: "ระบบเปิดสรรหามากกว่าที่ HR บอกว่าขาด ตรวจว่ามีตำแหน่งซ้ำหรือค้างอยู่ไหม",
};

function Chip({ className, children, title }: { className: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

/** Quota, Actual, short and over cells. Actual counts Offers already made; the note says where the number comes from. */
function NumberCells({ q, hrActual, offers, actual, short, over, compact }: { q: number; hrActual: number; offers: number; actual: number; short: number; over: number; compact?: boolean }) {
  const pad = compact ? "px-4 py-2.5" : "px-4 py-3";
  return (
    <>
      <td className={cn(pad, "text-right tabular-nums")}>{q}</td>
      <td className={cn(pad, "text-right tabular-nums")}>
        {actual}
        {offers > 0 && <span className="block text-[11px] leading-tight whitespace-nowrap text-muted-foreground">HR {hrActual} + Offer {offers}</span>}
      </td>
      <td className={cn(pad, "text-right tabular-nums", short > 0 && "font-medium text-[#b91c1c]")}>{short}</td>
      <td className={cn(pad, "text-right tabular-nums")}>{over}</td>
    </>
  );
}

function OpenCell({ open, match, compact }: { open: number; match: OpenMatch; compact?: boolean }) {
  return (
    <td className={cn("px-4", compact ? "py-2.5" : "py-3")}>
      <span className="mr-2 inline-block min-w-4 text-right tabular-nums">{open}</span>
      <Chip className={MATCH_CHIP[match]} title={MATCH_HINT[match]}>
        {OPEN_MATCH_LABEL[match]}
      </Chip>
    </td>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={cn(CARD, "px-5 py-4")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 font-heading text-3xl leading-none font-light tabular-nums", tone)}>{value.toLocaleString("en-US")}</dd>
    </div>
  );
}

export function ManpowerView({ rows, closedBranches, reportDate, isAdmin }: { rows: ManpowerRow[]; closedBranches: number; reportDate: string | null; isAdmin: boolean }) {
  const uid = useId();
  const [bu, setBu] = useState("");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState<ManpowerStatus | "">("");
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<PeopleFilter>({});
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set());

  const uniq = (pick: (r: ManpowerRow) => string) => [...new Set(rows.map(pick))].sort((a, b) => a.localeCompare(b, "th"));
  const bus = useMemo(() => uniq((r) => r.bu), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const regions = useMemo(() => uniq((r) => r.region), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const peopleChoices = useMemo(() => peopleOptions(rows), [rows]);

  const filter = { bu: bu || undefined, region: region || undefined, status: status || undefined, q: q.trim() || undefined, ...people };
  const shown = useMemo(() => filterManpowerRows(rows, filter), [rows, bu, region, status, q, people]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = useMemo(() => summarizeManpower(shown), [shown]);
  const hasFilter = bu !== "" || region !== "" || status !== "" || q !== "" || hasPeople(people);
  const exportHref = `/api/export/manpower?${new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])))}`;

  const toggle = (code: string) =>
    setOpenRows((s) => {
      const n = new Set(s);
      if (!n.delete(code)) n.add(code);
      return n;
    });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-heading text-3xl font-light">กำลังพล</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          โควต้าเทียบกับคนจริงของแต่ละสาขา จากรายงานของ HR{reportDate ? ` ณ ${formatThaiDate(reportDate)}` : ""} Actual รวมคนที่ Offer แล้วแต่ยังไม่เริ่มงาน และเทียบกับตำแหน่งที่ยังเปิดสรรหาอยู่ในระบบ
        </p>
        {closedBranches > 0 && <p className="mt-0.5 text-xs text-muted-foreground">ไม่รวมร้านที่ปิดแล้ว {closedBranches} สาขา</p>}
      </header>

      {rows.length === 0 ? (
        <div className="rounded-3xl bg-muted/60 px-6 py-14 text-center">
          <p className="font-heading text-lg">ยังไม่มีข้อมูลกำลังพล</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? "วางแท็บ Quota จากไฟล์ที่ได้จาก pnpm quota:import ลงในแท็บ Quota ของ Sheet (วางทับทั้งแท็บ)" : "ผู้ดูแลระบบยังไม่ได้นำข้อมูลโควต้าจาก HR เข้าระบบ"}
          </p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="สรุปกำลังพลตามตัวกรอง">
            <Card label="Quota" value={total.quota} />
            <Card label="Actual" value={total.actual} />
            <Card label="ขาด" value={total.short} tone={total.short > 0 ? "text-[#b91c1c]" : undefined} />
            <Card label="เกิน" value={total.over} />
            <Card label="สาขาครบอัตรา" value={total.full} tone="text-[#177a43]" />
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาสาขา"
                aria-label="ค้นหาสาขา"
                className="h-10 w-full rounded-full border border-input bg-white pr-3.5 pl-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <label className="sr-only" htmlFor={`${uid}-bu`}>
              BU
            </label>
            <Dropdown id={`${uid}-bu`} variant="pill" value={bu} onChange={setBu} emptyLabel="ทุก BU" options={bus.map((b) => ({ value: b, label: b }))} className="w-36" />
            <label className="sr-only" htmlFor={`${uid}-region`}>
              ภาค
            </label>
            <Dropdown id={`${uid}-region`} variant="pill" value={region} onChange={setRegion} emptyLabel="ทุกภาค" options={regions.map((b) => ({ value: b, label: b }))} className="w-36" />
            <label className="sr-only" htmlFor={`${uid}-status`}>
              สถานะ
            </label>
            <Dropdown
              id={`${uid}-status`}
              variant="pill"
              value={status}
              onChange={(v) => setStatus(v as ManpowerStatus | "")}
              emptyLabel="ทุกสถานะ"
              options={(Object.keys(MANPOWER_STATUS_LABEL) as ManpowerStatus[]).map((s) => ({ value: s, label: MANPOWER_STATUS_LABEL[s] }))}
              className="w-36"
            />
            <PeopleFilters idPrefix={`${uid}-people`} value={people} onChange={setPeople} options={peopleChoices} />
            {hasFilter && (
              <button
                type="button"
                onClick={() => {
                  setBu("");
                  setRegion("");
                  setStatus("");
                  setQ("");
                  setPeople({});
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                ล้างตัวกรอง
              </button>
            )}
            <a href={exportHref} className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-chip px-4 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Download className="size-4" aria-hidden />
              Export Excel
            </a>
          </div>

          {shown.length === 0 ? (
            <p className={cn(CARD, "py-12 text-center text-sm text-muted-foreground")}>ไม่พบสาขาตามตัวกรอง</p>
          ) : (
            <section className={cn(CARD, "overflow-hidden")} aria-label="กำลังพลรายสาขา">
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-12" />
                    <col />
                    {[0, 1, 2, 3].map((i) => (
                      <col key={i} className="w-28" />
                    ))}
                    <col className="w-28" />
                    <col className="w-48" />
                  </colgroup>
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-black/[0.06] bg-black/[0.025]">
                      <th className="px-3 py-2.5" aria-label="ขยายรายตำแหน่ง" />
                      {["สาขา / ตำแหน่ง", "Quota", "Actual", "ขาด", "เกิน", "สถานะ", "เปิดสรรหาในระบบ"].map((h, i) => (
                        <th key={h} className={cn("px-4 py-2.5 font-medium whitespace-nowrap", i >= 1 && i <= 4 && "text-right")}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const expanded = openRows.has(r.branchCode);
                      return (
                        <Fragment key={r.branchCode}>
                          <tr className="cursor-pointer border-b border-black/[0.05] transition-colors hover:bg-black/[0.02]" onClick={() => toggle(r.branchCode)}>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                aria-expanded={expanded}
                                aria-label={`${expanded ? "ซ่อน" : "ดู"}รายตำแหน่งของ ${r.branchName}`}
                                onClick={(e) => {
                                  e.stopPropagation(); // the row's own click would toggle a second time
                                  toggle(r.branchCode);
                                }}
                                className="grid size-7 place-items-center rounded-full outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                              >
                                <ChevronRight className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-90")} aria-hidden />
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <span className="block font-medium">{r.branchName}</span>
                              <span className="block text-xs text-muted-foreground">
                                {r.bu} · {r.region}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                AM {r.am || "-"} · RM {r.rm || "-"} · TA {r.taName || "-"}
                              </span>
                            </td>
                            <NumberCells q={r.quota} hrActual={r.hrActual} offers={r.offers} actual={r.actual} short={r.short} over={r.over} />
                            <td className="px-4 py-3">
                              <Chip className={STATUS_CHIP[r.status]}>{MANPOWER_STATUS_LABEL[r.status]}</Chip>
                            </td>
                            <OpenCell open={r.open} match={r.match} />
                          </tr>
                          {expanded &&
                            r.positions.map((p) => (
                              <tr key={p.positionCode} className="border-b border-black/[0.05] bg-black/[0.02] text-foreground/85">
                                <td />
                                <td className="py-2.5 pr-4 pl-8">
                                  <span className="block border-l-2 border-black/10 pl-3">{p.positionName}</span>
                                </td>
                                <NumberCells q={p.quota} hrActual={p.hrActual} offers={p.offers} actual={p.actual} short={p.short} over={p.over} compact />
                                <td className="px-4 py-2.5">
                                  <Chip className={STATUS_CHIP[p.status]}>{MANPOWER_STATUS_LABEL[p.status]}</Chip>
                                </td>
                                <OpenCell open={p.open} match={p.match} compact />
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
