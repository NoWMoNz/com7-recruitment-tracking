"use client";

import { useId, useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APPROVAL_LABEL } from "@/lib/domain/approval";
import { formatThaiDate } from "@/lib/domain/dates";
import type { ApprovalRow } from "@/lib/domain/queues";
import { cn } from "@/lib/utils";
import { Field, FIELD, FormError, useSubmit } from "../form-bits";
import { decideApproval } from "./actions";

type Row = ApprovalRow & { evidenceHref: string };
type Pending = { row: Row; decision: "approve" | "reject" } | null;

const TYPE_CLASS = { Cancel: "bg-red-100 text-[#b91c1c]", Hold: "bg-amber-100 text-amber-900" } as const;

function thaiDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // dd/mm/yyyy HH:mm in Bangkok time, Gregorian year like every other date in the app.
  return d
    .toLocaleString("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    .replace(",", "");
}

function DecisionDialog({ pending, onClose }: { pending: Pending; onClose: () => void }) {
  const uid = useId();
  const [note, setNote] = useState("");
  const { pending: busy, errors, run, clear } = useSubmit(() => {
    setNote("");
    onClose();
  });
  const approve = pending?.decision === "approve";
  const close = () => {
    setNote("");
    onClose();
  };

  return (
    <Dialog open={pending !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="rounded-3xl p-6 sm:max-w-md">
        {pending && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => decideApproval(pending.row.id, pending.decision, note),
                approve ? `อนุมัติ${APPROVAL_LABEL[pending.row.type]}แล้ว` : "บันทึกไม่อนุมัติแล้ว ตำแหน่งกลับเป็น ว่าง",
              );
            }}
          >
            <DialogHeader>
              <DialogTitle className="font-heading text-xl font-medium">
                {approve ? "อนุมัติ" : "ไม่อนุมัติ"}คำขอ{APPROVAL_LABEL[pending.row.type]}
              </DialogTitle>
              <DialogDescription>
                {pending.row.positionName} · {pending.row.branchName}
                {approve
                  ? pending.row.type === "Cancel"
                    ? ` จะถูกยกเลิกและหักออกจาก vacancy ตั้งแต่ ${formatThaiDate(pending.row.effectiveDate)}`
                    : ` จะถูกพัก หยุดนับ TAT ตั้งแต่ ${formatThaiDate(pending.row.effectiveDate)}`
                  : " จะกลับเป็นสถานะ ว่าง"}
              </DialogDescription>
            </DialogHeader>
            <FormError message={errors.form} />
            <Field id={`${uid}-note`} label={approve ? "หมายเหตุ (ไม่บังคับ)" : "เหตุผลที่ไม่อนุมัติ"} error={errors.note}>
              <textarea
                id={`${uid}-note`}
                value={note}
                onChange={(e) => (setNote(e.target.value), clear("note"))}
                rows={3}
                required={!approve}
                className={cn(FIELD, "h-auto py-2")}
              />
            </Field>
            <DialogFooter>
              <button
                type="submit"
                disabled={busy}
                className={cn(
                  "h-10 rounded-full px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                  approve ? "bg-primary" : "bg-destructive",
                )}
              >
                {busy ? "กำลังบันทึก…" : approve ? "ยืนยันอนุมัติ" : "ยืนยันไม่อนุมัติ"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ApprovalsView({ rows }: { rows: Row[] }) {
  const [pending, setPending] = useState<Pending>(null);

  if (rows.length === 0) {
    return <p className="rounded-[1.75rem] bg-white/65 py-12 text-center text-muted-foreground ring-1 ring-black/5">ไม่มีคำขอที่รออนุมัติ</p>;
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        รออนุมัติ <b className="text-foreground">{rows.length}</b> รายการ เรียงจากที่ส่งมาก่อน
      </p>
      <ul className="grid gap-4 xl:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="flex gap-4 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
            <a
              href={r.evidenceHref}
              target="_blank"
              rel="noreferrer"
              className="group relative block size-28 shrink-0 overflow-hidden rounded-2xl bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-36"
              aria-label={`เปิดรูปหลักฐานของ ${r.positionName} ${r.branchName} ในแท็บใหม่`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private evidence served by our own route */}
              <img src={r.evidenceHref} alt="" className="size-full object-cover transition-transform group-hover:scale-105" />
              <span className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-black/55 text-white">
                <ExternalLink className="size-3.5" aria-hidden />
              </span>
            </a>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TYPE_CLASS[r.type])}>ขอ{APPROVAL_LABEL[r.type]}</span>
                <span className="text-xs text-muted-foreground">มีผล {formatThaiDate(r.effectiveDate)}</span>
              </div>
              <h2 className="font-heading leading-snug font-medium">
                {r.positionName} · {r.branchName}
              </h2>
              <p className="text-sm text-foreground/80">“{r.reason}”</p>
              <p className="text-xs text-muted-foreground">
                {r.region}
                {r.province && ` · ${r.province}`} · TA {r.taName || "-"} · แจ้งสรรหา {formatThaiDate(r.requestDate)} · ขอโดย {r.requestedBy} เมื่อ {thaiDateTime(r.requestedAt)}
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPending({ row: r, decision: "approve" })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Check className="size-4" aria-hidden />
                  อนุมัติ
                </button>
                <button
                  type="button"
                  onClick={() => setPending({ row: r, decision: "reject" })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium text-destructive ring-1 ring-destructive/30 outline-none hover:bg-destructive/5 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <X className="size-4" aria-hidden />
                  ไม่อนุมัติ
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <DecisionDialog pending={pending} onClose={() => setPending(null)} />
    </>
  );
}
