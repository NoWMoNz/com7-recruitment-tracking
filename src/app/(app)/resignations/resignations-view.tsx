"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, RotateCcw, Search, UserMinus } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { formatThaiDate } from "@/lib/domain/dates";
import { filterResignRows, NOTE_MAX, RESIGN_STATE_LABEL, RESIGN_TITLES, type ResignRow, type ResignState } from "@/lib/domain/resign";
import { cn } from "@/lib/utils";
import { Field, FIELD, FormError, useSubmit } from "../form-bits";
import { addResignation, withdrawResignation } from "./actions";

const CARD = "rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5";
const STATE_CHIP: Record<ResignState, string> = {
  upcoming: "bg-amber-100 text-amber-900",
  resigned: "bg-black/[0.06] text-foreground/80",
  withdrawn: "bg-[#1f9d55]/12 text-[#177a43]",
};

/** What the withdrawal will do to the requisition opened for this resignation, in plain words. */
function consequence(r: ResignRow): string {
  switch (r.reqStatus) {
    case null:
      return "ไม่พบตำแหน่งที่เปิดไว้จากการลาออกนี้ ระบบจะบันทึกการยกเลิกลาออกเท่านั้น";
    case "Vacancy":
      return "ตำแหน่งว่างที่เปิดไว้จากการลาออกนี้จะถูกปิดเป็น Cancel ให้ทันที โดยไม่ต้องรออนุมัติ";
    case "Offer":
    case "Hold":
    case "PendingCancel":
    case "PendingHold":
      return "ตำแหน่งที่เปิดไว้ยังมีการดำเนินการอยู่ (Offer, พัก หรือรออนุมัติ) ระบบจะไม่ปิดให้ แต่จะส่งให้ผู้ดูแลระบบตรวจว่าจะทำอย่างไรต่อ";
    default:
      return "ตำแหน่งที่เปิดไว้ปิดไปแล้ว ระบบจะบันทึกการยกเลิกลาออกเท่านั้น";
  }
}

function WithdrawForm({ row, onDone }: { row: ResignRow; onDone: () => void }) {
  const uid = useId();
  const [note, setNote] = useState("");
  const { pending, errors, run, clear } = useSubmit(onDone);
  const router = useRouter();
  // "already withdrawn" / "not found" mean the list on screen is out of date: reload it behind the dialog.
  useEffect(() => {
    if (errors.form) router.refresh();
  }, [errors.form, router]);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => withdrawResignation({ rowNumber: row.rowNumber, employeeId: row.employeeId, effectiveDate: row.effectiveDate, note }), `ยกเลิกลาออกของ ${row.name} แล้ว`);
      }}
    >
      <FormError message={errors.form} />
      <Field id={`${uid}-note`} label="เหตุผลที่ยกเลิกลาออก" error={errors.note}>
        <textarea
          id={`${uid}-note`}
          value={note}
          rows={3}
          maxLength={NOTE_MAX}
          aria-invalid={Boolean(errors.note)}
          aria-describedby={errors.note ? `${uid}-note-err` : undefined}
          onChange={(e) => (setNote(e.target.value), clear("note"))}
          className={cn(FIELD, "h-auto py-2")}
        />
      </Field>
      <p className="rounded-xl bg-muted/70 px-3 py-2 text-xs text-foreground/75">{consequence(row)}</p>
      <DialogFooter>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-full bg-ink-chip px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {pending ? "กำลังบันทึก…" : "ยืนยันยกเลิกลาออก"}
        </button>
      </DialogFooter>
    </form>
  );
}

type Option = { value: string; label: string };

/** Add a resignation without going to the Sheet. */
function AddForm({ branches, positions, isAdmin, onDone }: { branches: Option[]; positions: Option[]; isAdmin: boolean; onDone: () => void }) {
  const uid = useId();
  const [v, setV] = useState({ employeeId: "", title: "นาย", firstName: "", lastName: "", branchCode: "", positionCode: "", effectiveDate: "" });
  const { pending, errors, run, clear } = useSubmit(onDone);
  const set = (k: keyof typeof v, val: string) => {
    setV((s) => ({ ...s, [k]: val }));
    clear(k);
  };
  const text = (k: "employeeId" | "firstName" | "lastName", label: string) => (
    <Field id={`${uid}-${k}`} label={label} error={errors[k]}>
      <input id={`${uid}-${k}`} value={v[k]} onChange={(e) => set(k, e.target.value)} className={FIELD} aria-invalid={Boolean(errors[k])} autoComplete="off" />
    </Field>
  );
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addResignation(v), "เพิ่มรายชื่อลาออกแล้ว");
      }}
    >
      <FormError message={errors.form} />
      {text("employeeId", "รหัสพนักงาน")}
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr]">
        <Field id={`${uid}-title`} label="คำนำหน้า" error={errors.title}>
          <Dropdown id={`${uid}-title`} value={v.title} onChange={(x) => set("title", x)} options={RESIGN_TITLES.map((t) => ({ value: t, label: t }))} invalid={Boolean(errors.title)} />
        </Field>
        {text("firstName", "ชื่อ")}
        {text("lastName", "นามสกุล")}
      </div>
      <Field id={`${uid}-branch`} label="สาขา" error={errors.branchCode}>
        <Dropdown id={`${uid}-branch`} value={v.branchCode} onChange={(x) => set("branchCode", x)} options={branches} placeholder="เลือกสาขา" searchable invalid={Boolean(errors.branchCode)} />
      </Field>
      <Field id={`${uid}-position`} label="ตำแหน่ง" error={errors.positionCode}>
        <Dropdown id={`${uid}-position`} value={v.positionCode} onChange={(x) => set("positionCode", x)} options={positions} placeholder="เลือกตำแหน่ง" invalid={Boolean(errors.positionCode)} />
      </Field>
      <Field id={`${uid}-date`} label="วันที่มีผลลาออก" error={errors.effectiveDate}>
        <DatePicker id={`${uid}-date`} value={v.effectiveDate} onChange={(x) => set("effectiveDate", x)} invalid={Boolean(errors.effectiveDate)} />
      </Field>
      <p className="rounded-xl bg-muted/70 px-3 py-2 text-xs text-foreground/75">
        {isAdmin ? "ระบบจะประมวลผลให้ทันที และเปิดตำแหน่งว่างตามวันที่มีผล" : "รายชื่อจะขึ้นในหน้านี้หลังผู้ดูแลระบบกดประมวลผล"}
      </p>
      <DialogFooter>
        <button type="submit" disabled={pending} className="h-10 rounded-full bg-ink-chip px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60">
          {pending ? "กำลังบันทึก…" : "เพิ่มรายชื่อ"}
        </button>
      </DialogFooter>
    </form>
  );
}

export function ResignationsView({ rows, canAdd, isAdmin, branches, positions }: { rows: ResignRow[]; canAdd: boolean; isAdmin: boolean; branches: Option[]; positions: Option[] }) {
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<ResignRow | null>(null);
  const [bu, setBu] = useState("");
  const [region, setRegion] = useState("");
  const [state, setState] = useState<ResignState | "">("");
  const [range, setRange] = useState<DateRangeValue>(null);
  const [q, setQ] = useState("");

  const bus = useMemo(() => [...new Set(rows.map((r) => r.bu))].sort((a, b) => a.localeCompare(b, "th")), [rows]);
  const regions = useMemo(() => [...new Set(rows.map((r) => r.region))].sort((a, b) => a.localeCompare(b, "th")), [rows]);
  const filter = { bu: bu || undefined, region: region || undefined, state: state || undefined, from: range?.from, to: range?.to, q: q.trim() || undefined };
  const shown = useMemo(() => filterResignRows(rows, filter), [rows, bu, region, state, range, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasFilter = bu !== "" || region !== "" || state !== "" || range !== null || q !== "";

  const count = (s: ResignState) => shown.filter((r) => r.state === s).length;
  const exportHref = `/api/export/resignations?${new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])))}`;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-heading text-3xl font-light">รายชื่อลาออก</h1>
        <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
          <b className="font-medium text-foreground">{shown.length}</b> คน<span aria-hidden> · </span>รอถึงวันมีผล <b className="font-medium text-foreground">{count("upcoming")}</b>
          <span aria-hidden> · </span>ลาออกแล้ว <b className="font-medium text-foreground">{count("resigned")}</b>
          <span aria-hidden> · </span>ยกเลิกลาออก <b className="font-medium text-foreground">{count("withdrawn")}</b>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">รายชื่อมาจากข้อมูลลาออกที่ประมวลผลแล้ว กด “ยกเลิกลาออก” เมื่อพนักงานขอเปลี่ยนใจ</p>
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
        <label className="sr-only" htmlFor="res-bu">
          BU
        </label>
        <Dropdown id="res-bu" variant="pill" value={bu} onChange={setBu} emptyLabel="ทุก BU" options={bus.map((b) => ({ value: b, label: b }))} className="w-36" />
        <label className="sr-only" htmlFor="res-region">
          ภาค
        </label>
        <Dropdown id="res-region" variant="pill" value={region} onChange={setRegion} emptyLabel="ทุกภาค" options={regions.map((r) => ({ value: r, label: r }))} className="w-36" />
        <label className="sr-only" htmlFor="res-state">
          สถานะ
        </label>
        <Dropdown
          id="res-state"
          variant="pill"
          value={state}
          onChange={(v) => setState(v as ResignState | "")}
          emptyLabel="ทุกสถานะ"
          options={(Object.keys(RESIGN_STATE_LABEL) as ResignState[]).map((s) => ({ value: s, label: RESIGN_STATE_LABEL[s] }))}
          className="w-40"
        />
        <label className="sr-only" htmlFor="res-range">
          วันที่มีผล
        </label>
        <DateRangePicker id="res-range" allowAll allLabel="ทุกวันที่มีผล" value={range} onChange={setRange} aria-label="วันที่มีผลลาออก" className="w-64" />
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setBu("");
              setRegion("");
              setState("");
              setRange(null);
              setQ("");
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            ล้างตัวกรอง
          </button>
        )}
        <span className="ml-auto flex items-center gap-2">
          {canAdd && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-chip px-4 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Plus className="size-4" aria-hidden />
              เพิ่มรายชื่อลาออก
            </button>
          )}
          <a href={exportHref} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-black/[0.1] outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Download className="size-4" aria-hidden />
            Export Excel
          </a>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl bg-muted/60 px-6 py-14 text-center">
          <p className="font-heading text-lg">ยังไม่มีรายชื่อลาออก</p>
          <p className="mt-1 text-sm text-muted-foreground">{canAdd ? "กด “เพิ่มรายชื่อลาออก” เพื่อเริ่ม หรือนำข้อมูลเข้าแท็บ Import_Resign แล้วกดประมวลผล" : "เมื่อมีการนำข้อมูลลาออกเข้าระบบและประมวลผลแล้ว รายชื่อจะมาอยู่ที่นี่"}</p>
        </div>
      ) : shown.length === 0 ? (
        <p className={cn(CARD, "py-12 text-center text-sm text-muted-foreground")}>ไม่พบรายชื่อตามตัวกรอง</p>
      ) : (
        <section className={cn(CARD, "overflow-hidden")} aria-label="รายชื่อลาออก">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-black/[0.06] bg-black/[0.025]">
                  {["พนักงาน", "สาขา / ตำแหน่ง", "TA", "วันที่มีผล", "สถานะ", "ตำแหน่งที่เปิดไว้", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_tr]:border-b [&_tr]:border-black/[0.05] [&_tr:last-child]:border-0">
                {shown.map((r) => (
                  <tr key={`${r.rowNumber}-${r.employeeId}`}>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{r.name}</span>
                      <span className="block text-xs text-muted-foreground">รหัส {r.employeeId}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">{r.positionName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.branchName} · {r.bu} · {r.region}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.taName || "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatThaiDate(r.effectiveDate)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", STATE_CHIP[r.state])}>{RESIGN_STATE_LABEL[r.state]}</span>
                      {r.state === "withdrawn" && (
                        <span className="mt-1 block max-w-56 text-xs text-muted-foreground">
                          {r.cancelledBy} · {r.cancelledDay}
                          {r.cancelNote && <span className="block text-foreground/70">{r.cancelNote}</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{r.reqStatus ? <StatusBadge status={r.reqStatus} /> : <span className="text-xs text-muted-foreground">ไม่พบ</span>}</td>
                    <td className="px-4 py-3 text-right">
                      {r.canWithdraw && (
                        <button
                          type="button"
                          onClick={() => setTarget(r)}
                          aria-label={`ยกเลิกลาออก ${r.name}`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-black/[0.1] outline-none transition-transform duration-200 hover:scale-[1.04] focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:scale-100"
                        >
                          <UserMinus className="size-3.5" aria-hidden />
                          ยกเลิกลาออก
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl p-6 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-medium">เพิ่มรายชื่อลาออก</DialogTitle>
            <DialogDescription>บันทึกลงแท็บ Import_Resign ใน Google Sheet</DialogDescription>
          </DialogHeader>
          {adding && <AddForm branches={branches} positions={positions} isAdmin={isAdmin} onDone={() => setAdding(false)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยกเลิกลาออก</DialogTitle>
            {target && (
              <DialogDescription>
                {target.name} · {target.positionName} · {target.branchName} · มีผล {formatThaiDate(target.effectiveDate)}
              </DialogDescription>
            )}
          </DialogHeader>
          {target && <WithdrawForm key={`${target.rowNumber}-${target.employeeId}`} row={target} onDone={() => setTarget(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
