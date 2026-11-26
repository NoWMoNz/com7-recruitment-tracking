"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dropdown } from "@/components/ui/dropdown";
import type { FilterOptions } from "@/lib/report/load";
import { cn } from "@/lib/utils";
import { recomputeMonth } from "./actions";
import { reportQuery } from "./report-href";

type Params = Record<string, string | undefined>;

/** Filter bar: each change replaces the URL, the server re-renders the report. */
export function ReportFilters({ params, options }: { params: Params; options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const go = (patch: Params) => start(() => router.replace(`${pathname}?${reportQuery(params, patch)}`, { scroll: false }));

  const provinces = options.provinces.filter((p) => !params.region || p.region === params.region);
  const branches = options.branches.filter((b) => (!params.bu || b.bu === params.bu) && (!params.region || b.region === params.region) && (!params.province || b.province === params.province));
  const hasFilter = Boolean(params.bu || params.region || params.province || params.branch || params.position || params.am || params.rm || params.ta);
  const exportHref = `/api/export?${reportQuery(params)}`;

  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      {params.tab !== "history" && (
        <>
          <label className="sr-only" htmlFor="rep-range">
            ช่วงวันที่
          </label>
          <DateRangePicker
            id="rep-range"
            allowAll
            value={params.all ? null : { from: params.from ?? "", to: params.to ?? "" }}
            onChange={(v) => go(v === null ? { all: "1", from: undefined, to: undefined } : { all: undefined, from: v.from, to: v.to })}
            className="w-64"
          />
        </>
      )}

      <label className="sr-only" htmlFor="rep-bu">BU</label>
      <Dropdown id="rep-bu" variant="pill" value={params.bu ?? ""} onChange={(v) => go({ bu: v, branch: undefined })} emptyLabel="ทุก BU" options={options.bus.map((b) => ({ value: b, label: b }))} className="w-36" />
      <label className="sr-only" htmlFor="rep-region">ภาค</label>
      <Dropdown id="rep-region" variant="pill" value={params.region ?? ""} onChange={(v) => go({ region: v, province: undefined, branch: undefined })} emptyLabel="ทุกภาค" options={options.regions.map((r) => ({ value: r, label: r }))} className="w-36" />
      <label className="sr-only" htmlFor="rep-province">จังหวัด</label>
      <Dropdown id="rep-province" variant="pill" value={params.province ?? ""} onChange={(v) => go({ province: v, branch: undefined })} emptyLabel="ทุกจังหวัด" options={provinces.map((p) => ({ value: p.value, label: p.value }))} className="w-40" />
      <label className="sr-only" htmlFor="rep-branch">สาขา</label>
      <Dropdown id="rep-branch" variant="pill" value={params.branch ?? ""} onChange={(v) => go({ branch: v })} emptyLabel="ทุกสาขา" options={branches.map((b) => ({ value: b.value, label: b.label }))} className="w-52" searchPlaceholder="ค้นหาสาขา…" />
      <label className="sr-only" htmlFor="rep-position">ตำแหน่ง</label>
      <Dropdown id="rep-position" variant="pill" value={params.position ?? ""} onChange={(v) => go({ position: v })} emptyLabel="ทุกตำแหน่ง" options={options.positions.map((p) => ({ value: p.value, label: p.label }))} className="w-44" />
      <label className="sr-only" htmlFor="rep-am">AM</label>
      <Dropdown id="rep-am" variant="pill" value={params.am ?? ""} onChange={(v) => go({ am: v })} emptyLabel="ทุก AM" options={options.ams.map((n) => ({ value: n, label: n }))} className="w-36" searchPlaceholder="ค้นหา AM…" />
      <label className="sr-only" htmlFor="rep-rm">RM</label>
      <Dropdown id="rep-rm" variant="pill" value={params.rm ?? ""} onChange={(v) => go({ rm: v })} emptyLabel="ทุก RM" options={options.rms.map((n) => ({ value: n, label: n }))} className="w-36" searchPlaceholder="ค้นหา RM…" />
      <label className="sr-only" htmlFor="rep-ta">TA</label>
      <Dropdown id="rep-ta" variant="pill" value={params.ta ?? ""} onChange={(v) => go({ ta: v })} emptyLabel="ทุก TA" options={options.tas.map((t) => ({ value: t.value, label: t.label }))} className="w-36" />
      {hasFilter && (
        <button type="button" onClick={() => go({ bu: undefined, region: undefined, province: undefined, branch: undefined, position: undefined, am: undefined, rm: undefined, ta: undefined })} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted">
          <RotateCcw className="size-3.5" aria-hidden />
          ล้างตัวกรอง
        </button>
      )}
      <a href={exportHref} className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-chip px-4 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Download className="size-4" aria-hidden />
        Export Excel
      </a>
    </div>
  );
}

export function RecomputeButton({ month }: { month: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await recomputeMonth(month);
          if (!res.ok) {
            toast.error(res.errors.form ?? "ไม่สำเร็จ");
            return;
          }
          toast.success(`คำนวณงวด ${month} ใหม่แล้ว`);
          router.refresh();
        })
      }
      className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs ring-1 ring-border hover:bg-muted disabled:opacity-60"
    >
      <RefreshCw className={cn("size-3.5", pending && "animate-spin")} aria-hidden />
      {pending ? "กำลังคำนวณ…" : "คำนวณงวดนี้ใหม่"}
    </button>
  );
}
