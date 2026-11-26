"use client";

import { useId, useState } from "react";
import { Dropdown } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FormError, useSubmit } from "../form-bits";
import { changeBranchTa } from "./actions";
import { handOverPreview, type BranchHead } from "@/lib/domain/people";

export interface BranchTaTarget {
  branchCode: string;
  branchName: string;
  head: BranchHead;
}

function BranchTaForm({ target, assignable, onDone }: { target: BranchTaTarget; assignable: { value: string; label: string }[]; onDone: () => void }) {
  const uid = useId();
  const [taEmail, setTaEmail] = useState(target.head.taEmail);
  const { pending, errors, run, clear } = useSubmit(onDone);
  const name = assignable.find((o) => o.value === taEmail)?.label ?? "TA ที่เลือก";
  // The TA already shown can still be picked: positions others own (or extra group rules) are gathered under them.
  const { moving, changes: changed } = handOverPreview(target.head, taEmail);

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => changeBranchTa(target.branchCode, taEmail), `เปลี่ยน TA ของ ${target.branchName} แล้ว`);
      }}
    >
      <FormError message={errors.form} />
      <Field id={`${uid}-ta`} label="TA ผู้รับผิดชอบสาขา" error={errors.taEmail}>
        <Dropdown id={`${uid}-ta`} value={taEmail} onChange={(v) => (setTaEmail(v), clear("taEmail"))} options={assignable} placeholder="เลือก TA" invalid={Boolean(errors.taEmail)} />
      </Field>
      {changed && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {moving > 0
            ? `ตำแหน่งที่ยังไม่ปิด ${moving} ตำแหน่ง จะย้ายมาเป็นของ ${name} และตำแหน่งที่จะเปิดใหม่ของสาขานี้จะเป็นของ ${name}`
            : `ตำแหน่งที่จะเปิดใหม่ของสาขานี้จะเป็นของ ${name}`}
        </p>
      )}
      <p className="text-xs text-muted-foreground">การเปลี่ยนเจ้าของของแต่ละตำแหน่งจะถูกบันทึกในประวัติ (Report › ประวัติตำแหน่ง)</p>
      <DialogFooter>
        <button type="submit" disabled={pending || !changed} className="h-10 rounded-full bg-ink-chip px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60">
          {pending ? "กำลังบันทึก…" : "เปลี่ยน TA"}
        </button>
      </DialogFooter>
    </form>
  );
}

/** Hand a branch, with all its not-closed positions, to another TA. */
export function BranchTaDialog({ target, assignable, onClose }: { target: BranchTaTarget | null; assignable: { value: string; label: string }[]; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl p-6 sm:max-w-md">
        {target && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-xl font-medium">เปลี่ยน TA · {target.branchName}</DialogTitle>
              <DialogDescription>
                {target.branchCode} · ตอนนี้ TA {target.head.taName || "-"}
              </DialogDescription>
            </DialogHeader>
            <BranchTaForm key={target.branchCode} target={target} assignable={assignable} onDone={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
