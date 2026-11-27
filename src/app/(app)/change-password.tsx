"use client";

import { useId, useState } from "react";
import { KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PRESS } from "@/components/pending";
import { RAIL_LABEL } from "@/components/sidebar-nav";
import { cn } from "@/lib/utils";
import { changeOwnPassword } from "./actions";
import { Field, FIELD, FormError, useSubmit } from "./form-bits";

const FIELDS = [
  { key: "current", label: "รหัสผ่านปัจจุบัน", auto: "current-password" },
  { key: "next", label: "รหัสผ่านใหม่", auto: "new-password", hint: "อย่างน้อย 8 ตัวอักษร" },
  { key: "confirm", label: "ยืนยันรหัสผ่านใหม่", auto: "new-password" },
] as const;

type Values = Record<(typeof FIELDS)[number]["key"], string>;
const EMPTY: Values = { current: "", next: "", confirm: "" };

function PasswordForm({ onDone }: { onDone: () => void }) {
  const uid = useId();
  const [values, setValues] = useState<Values>(EMPTY);
  const { pending, errors, run, clear } = useSubmit(onDone);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => changeOwnPassword(values), "เปลี่ยนรหัสผ่านแล้ว ใช้รหัสใหม่ในการเข้าระบบครั้งต่อไป");
      }}
    >
      <FormError message={errors.form} />
      {FIELDS.map((f) => {
        const id = `${uid}-${f.key}`;
        return (
          <Field key={f.key} id={id} label={f.label} error={errors[f.key]} hint={"hint" in f ? f.hint : undefined}>
            <input
              id={id}
              type="password"
              required
              autoComplete={f.auto}
              value={values[f.key]}
              onChange={(e) => {
                setValues((v) => ({ ...v, [f.key]: e.target.value }));
                clear(f.key);
              }}
              className={FIELD}
              {...(errors[f.key] ? { "aria-invalid": true, "aria-describedby": `${id}-err` } : {})}
            />
          </Field>
        );
      })}
      <DialogFooter>
        <button type="submit" disabled={pending} className="h-10 rounded-full bg-ink-chip px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60">
          {pending ? "กำลังบันทึก…" : "เปลี่ยนรหัสผ่าน"}
        </button>
      </DialogFooter>
    </form>
  );
}

/** For people who sign in with a name and password: change it themselves. `rail` is the side rail's wide button. */
export function ChangePasswordButton({ rail = false, className }: { rail?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="เปลี่ยนรหัสผ่าน"
        title="เปลี่ยนรหัสผ่าน"
        className={cn(
          "rounded-full bg-white/80 text-foreground ring-1 ring-black/[0.05] outline-none hover:bg-white hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.25)] focus-visible:ring-3 focus-visible:ring-ring/50",
          PRESS,
          rail ? "relative flex h-10 w-full items-center gap-3 overflow-hidden pr-4" : "grid size-10 place-items-center",
          className,
        )}
      >
        {rail ? (
          <>
            <span className="grid size-10 shrink-0 place-items-center">
              <KeyRound className="size-4" aria-hidden />
            </span>
            <span className={cn(RAIL_LABEL, "absolute inset-x-10 top-0 flex-none text-center leading-10")}>เปลี่ยนรหัสผ่าน</span>
          </>
        ) : (
          <KeyRound className="size-4" aria-hidden />
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-medium">เปลี่ยนรหัสผ่าน</DialogTitle>
            <DialogDescription>สำหรับการเข้าระบบด้วยชื่อผู้ใช้และรหัสผ่าน</DialogDescription>
          </DialogHeader>
          {open && <PasswordForm onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
