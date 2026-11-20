"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "./action-utils";

export const FIELD = "h-10 w-full rounded-xl border border-input bg-white px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function useSubmit(onDone: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const run = (action: () => Promise<ActionResult>, success: string) =>
    start(async () => {
      const res = await action();
      if (!res.ok) {
        setErrors(res.errors);
        return;
      }
      setErrors({});
      toast.success(success);
      onDone();
      router.refresh();
    });
  /** Drop a field's error (and the form-level one) as soon as the user edits that field. */
  const clear = (key: string) =>
    setErrors((e) => {
      if (!(key in e) && !("form" in e)) return e;
      const rest = { ...e };
      delete rest[key];
      delete rest.form;
      return rest;
    });
  return { pending, errors, run, clear };
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

