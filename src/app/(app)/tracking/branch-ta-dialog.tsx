"use client";

import { useId, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BranchHead } from "@/lib/domain/people";
import { Field, FIELD, FormError, useSubmit } from "../form-bits";
import { changeBranchTa } from "./actions";

export interface BranchTaTarget {
  branchCode: string;
  branchName: string;
  head: BranchHead;
}

/** A TA name: pick one already in use (Chuthathip, …) or type a new one. */
export function TaNameInput({ id, value, onChange, names, invalid }: { id: string; value: string; onChange: (v: string) => void; names: string[]; invalid: boolean }) {
  return (
    <>
      <input
        id={id}
        list={`${id}-names`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="เลือกหรือพิมพ์ชื่อ TA"
        autoComplete="off"
        required
        className={FIELD}
        {...(invalid ? { "aria-invalid": true, "aria-describedby": `${id}-err` } : {})}
      />
      <datalist id={`${id}-names`}>
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </>
  );
}

function BranchTaForm({ target, names, onDone }: { target: BranchTaTarget; names: string[]; onDone: () => void }) {
  const uid = useId();
  const [name, setName] = useState(target.head.taName);
  const { pending, errors, run, clear } = useSubmit(onDone);

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => changeBranchTa(target.branchCode, name), `เปลี่ยน TA ของ ${target.branchName} แล้ว`);
      }}
    >
      <FormError message={errors.form} />
      <Field id={`${uid}-ta`} label="TA ประจำสาขา" error={errors.name}>
        <TaNameInput id={`${uid}-ta`} value={name} onChange={(v) => (setName(v), clear("name"))} names={names} invalid={Boolean(errors.name)} />
      </Field>
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
        ตำแหน่งที่ยังไม่ปิดของสาขานี้ {target.head.open} ตำแหน่ง จะใช้ TA นี้ทั้งหมด (รวมตำแหน่งที่เคยตั้ง TA แยกไว้)
      </p>
      <p className="text-xs text-muted-foreground">การเปลี่ยน TA ของแต่ละตำแหน่งจะถูกบันทึกในประวัติ (Report › ประวัติตำแหน่ง)</p>
      <DialogFooter>
        <button type="submit" disabled={pending} className="h-10 rounded-full bg-ink-chip px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60">
          {pending ? "กำลังบันทึก…" : "เปลี่ยน TA"}
        </button>
      </DialogFooter>
    </form>
  );
}

/** Set a shop's TA by name; its not-closed positions follow. */
export function BranchTaDialog({ target, names, onClose }: { target: BranchTaTarget | null; names: string[]; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl p-6 sm:max-w-md">
        {target && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-xl font-medium">เปลี่ยน TA · {target.branchName}</DialogTitle>
              <DialogDescription>ตอนนี้ TA {target.head.taName || "-"}</DialogDescription>
            </DialogHeader>
            <BranchTaForm key={target.branchCode} target={target} names={names} onDone={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
