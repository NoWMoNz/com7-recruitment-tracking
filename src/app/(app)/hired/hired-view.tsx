"use client";

import { useMemo, useState } from "react";
import { Download, RotateCcw, Search } from "lucide-react";
import { hasPeople, PeopleFilters } from "@/components/people-filters";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { formatThaiDate } from "@/lib/domain/dates";
import { filterHiredRows, type HiredRow } from "@/lib/domain/hired";
import { peopleOptions, type PeopleFilter } from "@/lib/domain/people";
import { cn } from "@/lib/utils";

const CARD = "rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5";
const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, "th"));

/** People who got an employee ID: their position left the tracking page and lands here. */
export function HiredView({ rows }: { rows: HiredRow[] }) {
  const [bu, setBu] = useState("");
  const [region, setRegion] = useState("");
  const [people, setPeople] = useState<PeopleFilter>({});
  const [range, setRange] = useState<DateRangeValue>(null);
  const [q, setQ] = useState("");

  const bus = useMemo(() => uniq(rows.map((r) => r.bu)), [rows]);
  const regions = useMemo(() => uniq(rows.map((r) => r.region)), [rows]);
  const peopleChoices = useMemo(() => peopleOptions(rows), [rows]);
  const filter = { bu: bu || undefined, region: region || undefined, from: range?.from, to: range?.to, q: q.trim() || undefined, ...people };
  const shown = useMemo(() => filterHiredRows(rows, filter), [rows, bu, region, range, q, people]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasFilter = bu !== "" || region !== "" || range !== null || q !== "" || hasPeople(people);
  const meet = shown.filter((r) => r.tatResult === "Meet").length;
  const exportHref = `/api/export/hired?${new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])))}`;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-heading text-3xl font-light">Hired</h1>
        <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
          <b className="font-medium text-foreground">{shown.length}</b> คน<span aria-hidden> · </span>TAT Meet <b className="font-medium text-foreground">{meet}</b>
          <span aria-hidden> · </span>Not Meet <b className={cn("font-medium", shown.length - meet ? "text-[#b91c1c]" : "text-foreground")}>{shown.length - meet}</b>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">ตำแหน่งย้ายมาที่นี่เมื่อ HR ออกรหัสพนักงานแล้ว รหัสพนักงานและวันเริ่มงานมาจากข้อมูลพนักงานใหม่ของ HR</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ รหัสพนักงาน สาขา หรือตำแหน่ง"
            aria-label="ค้นหา"
            className="h-10 w-full rounded-full border border-input bg-white pr-3.5 pl-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <label className="sr-only" htmlFor="hired-bu">
          BU
        </label>
        <Dropdown id="hired-bu" variant="pill" value={bu} onChange={setBu} emptyLabel="ทุก BU" options={bus.map((b) => ({ value: b, label: b }))} className="w-36" />
        <label className="sr-only" htmlFor="hired-region">
          ภาค
        </label>
        <Dropdown id="hired-region" variant="pill" value={region} onChange={setRegion} emptyLabel="ทุกภาค" options={regions.map((r) => ({ value: r, label: r }))} className="w-36" />
        <PeopleFilters idPrefix="hired" value={people} onChange={setPeople} options={peopleChoices} />
        <label className="sr-only" htmlFor="hired-range">
          วันเริ่มงาน
        </label>
        <DateRangePicker id="hired-range" allowAll allLabel="ทุกวันเริ่มงาน" value={range} onChange={setRange} aria-label="วันเริ่มงาน" className="w-64" />
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setBu("");
              setRegion("");
              setPeople({});
              setRange(null);
              setQ("");
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

      {rows.length === 0 ? (
        <div className="rounded-3xl bg-muted/60 px-6 py-14 text-center">
          <p className="font-heading text-lg">ยังไม่มีคนที่ได้รหัสพนักงาน</p>
          <p className="mt-1 text-sm text-muted-foreground">เมื่อนำข้อมูลพนักงานใหม่เข้าแท็บ Import_NewEmployee และประมวลผลแล้ว คนที่จับคู่กับ Offer ได้จะมาอยู่ที่นี่</p>
        </div>
      ) : shown.length === 0 ? (
        <p className={cn(CARD, "py-12 text-center text-sm text-muted-foreground")}>ไม่พบรายชื่อตามตัวกรอง</p>
      ) : (
        <section className={cn(CARD, "overflow-hidden")} aria-label="รายชื่อ Hired">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-black/[0.06] bg-black/[0.025]">
                  {["พนักงาน", "ตำแหน่ง / สาขา", "วันเริ่มงาน", "AM / RM / TA", "วันที่ Offer", "TAT", "Result"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_tr]:border-b [&_tr]:border-black/[0.05] [&_tr:last-child]:border-0">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <span className="block text-sm font-medium">{r.name}</span>
                      <span className="block text-muted-foreground">รหัส {r.employeeId}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-sm">{r.positionName}</span>
                      <span className="block text-muted-foreground">
                        {r.branchCode} {r.branchName} · {r.bu} · {r.region}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatThaiDate(r.startDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      AM {r.am || "-"} · RM {r.rm || "-"}
                      <span className="block text-foreground">TA {r.taName || "-"}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatThaiDate(r.offerDate)}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{r.tat} วัน</td>
                    <td className={cn("px-4 py-3 font-medium", r.tatResult === "Meet" ? "text-[#15803d]" : "text-[#b91c1c]")}>{r.tatResult === "Meet" ? "Meet" : "Not Meet"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
