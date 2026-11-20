"use client";

import { useId, useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Field, FIELD, FormError, useSubmit } from "../form-bits";
import { removeLogin, saveLogin } from "./actions";

export interface LoginItem {
  username: string;
  /** What the user it acts as can do, e.g. "ผู้ดูรายงาน (viewer)". */
  role: string;
}

/** Name + password sign-ins: who has one, and a form to add one or reset a password. */
export function LoginPanel({ logins, roles }: { logins: LoginItem[]; roles: { value: string; label: string }[] }) {
  const uid = useId();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("viewer");
  const [password, setPassword] = useState("");
  const { pending, errors, run, clear } = useSubmit(() => {
    setUsername("");
    setPassword("");
  });
  const [asking, setAsking] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const router = useRouter();

  const remove = async (name: string) => {
    setRemoving(true);
    const res = await removeLogin(name);
    setRemoving(false);
    if (!res.ok) {
      setRemoveError(Object.values(res.errors)[0] ?? "ลบไม่สำเร็จ");
      return;
    }
    toast.success(`ลบ ${name} แล้ว`);
    setAsking(null);
    router.refresh();
  };

  return (
    <section aria-labelledby={`${uid}-title`} className="space-y-4 rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
      <div>
        <h2 id={`${uid}-title`} className="flex items-center gap-2 font-heading font-medium">
          <KeyRound className="size-4" aria-hidden />
          เข้าด้วยชื่อผู้ใช้และรหัสผ่าน
        </h2>
        <p className="mt-1 text-sm text-foreground/70">
          ตั้งชื่อกับรหัสผ่านได้เลย ไม่ต้องมีบัญชี Google ระบบจะเพิ่มผู้ใช้ให้ในตารางด้านบน (แก้ขอบเขตหรือปิดบัญชีได้ที่นั่น) ใส่ชื่อที่มีอยู่แล้วเพื่อรีเซ็ตรหัสผ่าน
        </p>
      </div>

      {logins.length > 0 && (
        <ul className="divide-y divide-black/[0.06] rounded-2xl bg-muted/40">
          {logins.map((l) => (
            <li key={l.username} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-medium">{l.username}</span>
              <span className="min-w-0 flex-1 truncate text-foreground/65">{l.role}</span>
              <button
                type="button"
                onClick={() => (setRemoveError(""), setAsking(l.username))}
                aria-label={`ลบ ${l.username}`}
                className="grid size-8 place-items-center rounded-full text-foreground/60 outline-none hover:bg-black/5 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveLogin({ username, password, role }), `บันทึกชื่อผู้ใช้ ${username.trim().toLowerCase()} แล้ว`);
        }}
        className="grid gap-3 sm:grid-cols-3"
        autoComplete="off"
      >
        <Field id={`${uid}-u`} label="ชื่อผู้ใช้" error={errors.username}>
          <input
            id={`${uid}-u`}
            value={username}
            onChange={(e) => (setUsername(e.target.value), clear("username"))}
            className={FIELD}
            autoComplete="off"
            placeholder="เช่น boss"
            aria-invalid={Boolean(errors.username)}
          />
        </Field>
        <Field id={`${uid}-r`} label="สิทธิ์" error={errors.role} hint="ใช้เฉพาะตอนสร้างชื่อใหม่">
          <Dropdown id={`${uid}-r`} value={role} onChange={(v) => (setRole(v), clear("role"))} options={roles} invalid={Boolean(errors.role)} />
        </Field>
        <Field id={`${uid}-p`} label="รหัสผ่าน" error={errors.password}>
          <input
            id={`${uid}-p`}
            type="password"
            value={password}
            onChange={(e) => (setPassword(e.target.value), clear("password"))}
            className={FIELD}
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
          />
        </Field>
        <div className="space-y-2 sm:col-span-3">
          <FormError message={errors.form} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-chip px-5 text-sm text-white outline-none hover:bg-ink-chip/85 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(o) => !o && setAsking(null)}
        title={`ลบชื่อผู้ใช้ ${asking ?? ""}?`}
        description={
          <>
            คนนี้จะเข้าด้วยรหัสผ่านไม่ได้อีก (ผู้ใช้ในตารางด้านบนยังอยู่)
            {removeError && <span className="mt-3 block rounded-xl bg-destructive/10 px-3 py-2 text-destructive">{removeError}</span>}
          </>
        }
        confirmLabel="ลบ"
        pending={removing}
        onConfirm={() => asking && remove(asking)}
      />
    </section>
  );
}
