"use client";

import { useId, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { REQUISITION_SOURCES } from "@/lib/domain/master";
import { Field, FIELD, FormError, useSubmit } from "../form-bits";
import { createRequisitions } from "./actions";

type Option = { value: string; label: string };
const SOURCE_LABEL: Record<(typeof REQUISITION_SOURCES)[number], string> = { NewStore: "ร้านเปิดใหม่", Project: "Project", Additional: "เพิ่มอัตรา" };

export function NewRequisitionForm({ branches, positions, tas, today }: { branches: Option[]; positions: Option[]; tas: Option[]; today: string }) {
  const uid = useId();
  const blank = { branch_code: "", position_code: "", headcount: "1", request_date: today, source: "Additional", ta_email: "", note: "" };
  const [v, setV] = useState(blank);
  const { pending, errors, run, clear } = useSubmit(() => setV(blank));
  const set = (k: keyof typeof blank, value: string) => {
    setV((s) => ({ ...s, [k]: value }));
    clear(k);
  };
  const id = (k: string) => `${uid}-${k}`;

  return (
    <section className="rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
      <h2 className="font-heading font-medium">เพิ่มตำแหน่งที่ต้องสรรหา</h2>
      <p className="mb-4 text-sm text-muted-foreground">ร้านเปิดใหม่ / Project / เพิ่มอัตรา: แต่ละอัตราจะเป็น 1 ตำแหน่งสถานะ “ว่าง” ทันที (แทนการวางในแท็บ Import_Requisition)</p>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createRequisitions(v), `เพิ่ม ${v.headcount} ตำแหน่งแล้ว`);
        }}
      >
        <FormError message={errors.form} />
        <div className="grid gap-3 md:grid-cols-3">
          <Field id={id("branch")} label="สาขา" error={errors.branch_code}>
            <Dropdown id={id("branch")} value={v.branch_code} onChange={(x) => set("branch_code", x)} options={branches} placeholder="เลือกสาขา" searchable searchPlaceholder="ค้นหาสาขา…" invalid={Boolean(errors.branch_code)} />
          </Field>
          <Field id={id("position")} label="ตำแหน่ง" error={errors.position_code}>
            <Dropdown id={id("position")} value={v.position_code} onChange={(x) => set("position_code", x)} options={positions} placeholder="เลือกตำแหน่ง" invalid={Boolean(errors.position_code)} />
          </Field>
          <Field id={id("headcount")} label="จำนวนอัตรา" error={errors.headcount}>
            <input id={id("headcount")} type="number" min={1} max={50} value={v.headcount} onChange={(e) => set("headcount", e.target.value)} className={FIELD} required />
          </Field>
          <Field id={id("date")} label="วันที่แจ้งสรรหา" error={errors.request_date}>
            <DatePicker id={id("date")} value={v.request_date} onChange={(x) => set("request_date", x)} invalid={Boolean(errors.request_date)} />
          </Field>
          <Field id={id("source")} label="ที่มา" error={errors.source}>
            <Dropdown id={id("source")} value={v.source} onChange={(x) => set("source", x)} options={REQUISITION_SOURCES.map((x) => ({ value: x, label: SOURCE_LABEL[x] }))} />
          </Field>
          <Field id={id("ta")} label="TA เจ้าของ" error={errors.ta_email} hint="เว้นว่าง = ใช้ตามการผูก Recruiter">
            <Dropdown id={id("ta")} value={v.ta_email} onChange={(x) => set("ta_email", x)} options={tas} emptyLabel="ตามการผูก Recruiter" invalid={Boolean(errors.ta_email)} />
          </Field>
        </div>
        <Field id={id("note")} label="หมายเหตุ (ไม่บังคับ)">
          <input id={id("note")} value={v.note} onChange={(e) => set("note", e.target.value)} className={FIELD} />
        </Field>
        <div className="flex justify-end">
          <button type="submit" disabled={pending} className="h-10 rounded-full bg-ink-chip px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60">
            {pending ? "กำลังบันทึก…" : `เพิ่ม ${v.headcount || 1} ตำแหน่ง`}
          </button>
        </div>
      </form>
    </section>
  );
}
