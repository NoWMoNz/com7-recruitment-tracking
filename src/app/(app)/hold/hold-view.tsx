"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Play, RotateCcw, Search } from "lucide-react";
import { BAND_CLASS, BAND_LABEL } from "@/components/aging-badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatThaiDate } from "@/lib/domain/dates";
import type { HoldRow } from "@/lib/domain/queues";
import { agingBand } from "@/lib/domain/tat";
import type { LocalDate } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { Field, FormError, useSubmit } from "../form-bits";
import { resumeHold } from "./actions";

interface Props {
  rows: HoldRow[];
  today: LocalDate;
  minDate?: LocalDate;
  backdateDays: number;
  /** Day limits for the colour of how long a position has been on hold (the same 30/60/90 as Aging). */
  bands: [number, number, number];
}

type Ctx = Omit<Props, "rows" | "bands">;

const SELECT = "h-10 min-w-0 rounded-full border border-input bg-white px-3.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function ResumeForm({ row, today, minDate, backdateDays, onDone }: Ctx & { row: HoldRow; onDone: () => void }) {
  const uid = useId();
  const [date, setDate] = useState(today);
  const { pending, errors, run, clear } = useSubmit(onDone);
  const min = [minDate, row.holdSince ?? undefined].filter(Boolean).sort().at(-1);

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => resumeHold(row.reqId, row.version, date), `${row.positionName} กลับมาเปิดสรรหาแล้ว`);
      }}
    >
      <FormError message={errors.form} />
      <Field
        id={`${uid}-date`}
        label="วันที่กลับมาเปิดสรรหา"
        error={errors.date}
        hint={`${date ? `วันที่เลือก ${formatThaiDate(date)}` : ""}${minDate ? ` · ย้อนหลังได้ไม่เกิน ${backdateDays} วัน` : ""}`}
      >
        <DatePicker id={`${uid}-date`} value={date} min={min} max={today} onChange={(v) => (setDate(v), clear("date"))} invalid={Boolean(errors.date)} />
      </Field>
      <p className="text-xs text-muted-foreground">TAT จะนับต่อจาก {row.tatAtHold} วัน (ไม่รวมช่วงที่พัก) และตำแหน่งจะกลับไปอยู่ในหน้าติดตามการสรรหา</p>
      <DialogFooter>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-full bg-ink-chip px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {pending ? "กำลังบันทึก…" : "ยืนยัน Resume"}
        </button>
      </DialogFooter>
    </form>
  );
}

export function HoldView({ rows, bands, ...ctx }: Props) {
  const [target, setTarget] = useState<HoldRow | null>(null);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");

  const regions = useMemo(() => [...new Set(rows.map((r) => r.region))], [rows]);
  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (region && r.region !== region) return false;
        const needle = q.trim().toLowerCase();
        return !needle || `${r.branchName} ${r.branchCode} ${r.positionName} ${r.taName} ${r.reason}`.toLowerCase().includes(needle);
      }),
    [rows, region, q],
  );

  const bandOf = (r: HoldRow) => agingBand(r.daysHeld, bands);
  const longest = rows.reduce((m, r) => Math.max(m, r.daysHeld), 0);
  const overdue = rows.filter((r) => r.daysHeld > bands[1]).length;
  const hasFilter = q !== "" || region !== "";

  const Resume = ({ r, full }: { r: HoldRow; full?: boolean }) =>
    r.canEdit ? (
      <button
        type="button"
        onClick={() => setTarget(r)}
        aria-label={`Resume ${r.positionName} ${r.branchName}`}
        className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-ink-chip px-4 text-sm font-medium text-white outline-none hover:bg-ink-chip/85 focus-visible:ring-3 focus-visible:ring-ring/50", full && "w-full")}
      >
        <Play className="size-3.5" aria-hidden />
        Resume
      </button>
    ) : (
      <span className="text-xs text-muted-foreground">เฉพาะ TA เจ้าของ</span>
    );

  const Held = ({ r }: { r: HoldRow }) => (
    <span className={cn("inline-flex min-w-14 justify-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums", BAND_CLASS[bandOf(r)])} title={`พักมา ${BAND_LABEL[bandOf(r)]}`}>
      {r.daysHeld} วัน
    </span>
  );

  const approval = (r: HoldRow) => (r.approvedBy ? `อนุมัติโดย ${r.approvedBy}${r.approvedAt ? ` · ${formatThaiDate(r.approvedAt)}` : ""}` : "ข้อมูลตั้งต้น (ไม่มีคำขอ)");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-heading text-3xl font-light">ตำแหน่งที่พักไว้ (Hold)</h1>
        <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
          {rows.length === 0 ? (
            "ตอนนี้ไม่มีตำแหน่งที่พักไว้"
          ) : (
            <>
              พักอยู่ <b className="font-medium text-foreground">{rows.length}</b> ตำแหน่ง<span aria-hidden> · </span>นานสุด <b className="font-medium text-foreground">{longest}</b> วัน
              <span aria-hidden> · </span>พักเกิน {bands[1]} วัน <b className={cn("font-medium", overdue ? "text-[#b91c1c]" : "text-foreground")}>{overdue}</b> ตำแหน่ง
            </>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">ไม่นับเป็น vacancy และหยุดนับ TAT จนกว่าจะกด Resume เรียงจากพักนานที่สุดก่อน</p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-3xl bg-muted/60 px-6 py-14 text-center">
          <p className="font-heading text-lg">ตอนนี้ไม่มีตำแหน่งที่พักไว้</p>
          <p className="mt-1 text-sm text-muted-foreground">ตำแหน่งที่ผู้ดูแลอนุมัติให้พักจะมาอยู่ที่นี่</p>
          <Link href="/tracking" className="mt-4 inline-flex h-10 items-center rounded-full bg-ink-chip px-5 text-sm font-medium text-white">
            ไปที่ติดตามการสรรหา
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาสาขา ตำแหน่ง TA หรือเหตุผล" aria-label="ค้นหา" className={cn(SELECT, "w-full pl-10 placeholder:text-muted-foreground")} />
            </div>
            <label className="sr-only" htmlFor="hold-region">
              ภาค
            </label>
            <Dropdown id="hold-region" variant="pill" value={region} onChange={setRegion} emptyLabel="ทุกภาค" options={regions.map((r) => ({ value: r, label: r }))} className="w-36" />
            {hasFilter && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setRegion("");
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                ล้างตัวกรอง
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="rounded-3xl bg-muted/60 py-12 text-center text-muted-foreground">ไม่มีตำแหน่งที่ตรงกับเงื่อนไข</p>
          ) : (
            <section className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
              <table className="hidden w-full text-left md:table">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-black/[0.06] bg-black/[0.025]">
                    <th className="py-2.5 pr-5 pl-6 font-medium">ตำแหน่ง / สาขา</th>
                    <th className="px-5 py-2.5 font-medium">พักมา</th>
                    <th className="px-5 py-2.5 font-medium">TAT ก่อนพัก</th>
                    <th className="px-5 py-2.5 font-medium">เหตุผล</th>
                    <th className="px-5 py-2.5 font-medium">TA</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.reqId} className="border-b border-black/[0.05] last:border-0 hover:bg-black/[0.02]">
                      <td className="relative py-3 pr-5 pl-6">
                        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", BAND_CLASS[bandOf(r)])} />
                        <div className="text-sm font-medium">{r.positionName}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.branchName} {r.branchCode} · {r.region}
                        </div>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <Held r={r} />
                        <span className="mt-1 block text-xs text-muted-foreground">ตั้งแต่ {formatThaiDate(r.holdSince)}</span>
                      </td>
                      <td className="px-5 py-3 text-sm whitespace-nowrap tabular-nums">{r.tatAtHold} วัน</td>
                      <td className="max-w-72 px-5 py-3">
                        <div className="text-sm text-foreground/85">{r.reason || "-"}</div>
                        <div className="text-xs text-muted-foreground">{approval(r)}</div>
                      </td>
                      <td className="px-5 py-3 text-sm">{r.taName || <span className="text-muted-foreground">ยังไม่มีเจ้าของ</span>}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <Resume r={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className="divide-y divide-black/[0.06] md:hidden">
                {shown.map((r) => (
                  <li key={r.reqId} className="relative space-y-2 py-4 pr-5 pl-6">
                    <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", BAND_CLASS[bandOf(r)])} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{r.positionName}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.branchName} · {r.region}
                        </div>
                      </div>
                      <Held r={r} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      พักตั้งแต่ {formatThaiDate(r.holdSince)} · TAT ก่อนพัก {r.tatAtHold} วัน · TA {r.taName || "ยังไม่มีเจ้าของ"}
                    </div>
                    {r.reason && <p className="text-sm text-foreground/85">{r.reason}</p>}
                    <div className="text-xs text-muted-foreground">{approval(r)}</div>
                    <Resume r={r} full />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="rounded-3xl p-6 sm:max-w-md">
          {target && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading text-xl font-medium">Resume · {target.positionName}</DialogTitle>
                <DialogDescription>
                  {target.branchName} พักตั้งแต่ {formatThaiDate(target.holdSince)} ({target.daysHeld} วัน)
                </DialogDescription>
              </DialogHeader>
              <ResumeForm key={target.reqId} row={target} {...ctx} onDone={() => setTarget(null)} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
