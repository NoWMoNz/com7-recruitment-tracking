"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** "Are you sure?" in the app's own dialog, in place of the browser's window.confirm. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "ยืนยัน",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent showCloseButton={false} className="rounded-3xl p-6 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-medium">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter className="-mx-0 -mb-0 gap-2 p-0 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="h-10 rounded-full bg-black/[0.06] px-5 text-sm outline-none hover:bg-black/10 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="h-10 rounded-full bg-destructive px-5 text-sm font-medium text-white outline-none hover:bg-destructive/90 focus-visible:ring-3 focus-visible:ring-destructive/40 disabled:opacity-60"
          >
            {pending ? "กำลังดำเนินการ…" : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
