"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

/** Press feel shared by the buttons that leave or enter the app: a small lift on hover, a sink on press. */
export const PRESS =
  "transition-[transform,box-shadow,background-color,opacity] duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] active:duration-100 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100";

/** Submit button that shows a spinner and `pendingLabel` while its form is being sent, and cannot be pressed twice. */
export function SubmitButton({ children, pendingLabel, className, ...rest }: Omit<ComponentProps<"button">, "type"> & { children: ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={cn("disabled:pointer-events-none", pending ? "opacity-90" : "", className)} {...rest}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Sign-out arrow: nudges toward the door on hover (inside a `group`), spins while signing out. */
export function LogoutIcon() {
  const { pending } = useFormStatus();
  return pending ? (
    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
  ) : (
    <LogOut className="size-4 transition-transform duration-200 ease-out group-hover/logout:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
  );
}
