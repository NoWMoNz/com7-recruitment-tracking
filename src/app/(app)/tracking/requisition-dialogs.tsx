"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { daysBetween, formatThaiDate } from "@/lib/domain/dates";
import { TITLES } from "@/lib/domain/offer";
import type { LocalDate } from "@/lib/domain/types";
import type { TrackingRow } from "@/lib/domain/tracking";
import { cn } from "@/lib/utils";
import { Field, FIELD, FormError, useSubmit } from "../form-bits";
import { editRequisition } from "../master/actions";
import { submitApprovalRequest, submitOffer, submitTurndown } from "./actions";

export interface EditContext {
  today: LocalDate;
  /** Earliest pickable date; undefined for super_admin. */
  minDate?: LocalDate;
  backdateDays: number;
  channels: string[];
  /** super_admin: can edit request date / owner of any row. */
  isAdmin: boolean;
  /** Active TAs and super_admins, for the owner picker. */
  assignable: { value: string; label: string }[];
}

export type DialogTarget = { mode: "offer" | "turndown" | "edit"; row: TrackingRow } | null;

/** ตำแหน่ง / สาขา / TAT / จังหวัด / ภาค, shown at the top of both forms. */
function RowSummary({ row }: { row: TrackingRow }) {
  const items: [string, ReactNode][] = [
    ["สาขา", `${row.branchName} (${row.branchCode})`],
    ["TAT", `${row.tat} วัน`],
    ["จังหวัด", row.province || "-"],
    ["ภาค", row.region],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-muted px-4 py-3 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="truncate font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function OfferForm({ row, ctx, onDone }: { row: TrackingRow; ctx: EditContext; onDone: () => void }) {
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const [title, setTitle] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [offerDate, setOfferDate] = useState(ctx.today);
  const [channel, setChannel] = useState("");
  const { pending, errors, run, clear } = useSubmit(onDone);

  // Preview only; the server recomputes TAT with hold days up to the chosen date.
  const tatAtDate = offerDate ? Math.max(0, daysBetween(row.requestDate, offerDate) - row.holdDays) : null;
  const meet = tatAtDate !== null && tatAtDate <= row.slaDays;
  const invalid = (k: string) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `${id(k)}-err` } : {});

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => submitOffer(row.id, row.version, { title, firstName, lastName, phone, offerDate, channel }), `บันทึก Offer ${row.positionName} แล้ว`);
      }}
    >
      <RowSummary row={row} />
      <FormError message={errors.form} />

      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <Field id={id("title")} label="คำนำหน้า" error={errors.title}>
          <Dropdown id={id("title")} value={title} onChange={(v) => (setTitle(v), clear("title"))} options={TITLES.map((t) => ({ value: t, label: t }))} placeholder="เลือก" {...invalid("title")} />
        </Field>
        <Field id={id("first")} label="ชื่อ" error={errors.firstName}>
          <input id={id("first")} value={firstName} onChange={(e) => (setFirstName(e.target.value), clear("firstName"))} className={FIELD} required autoComplete="off" {...invalid("firstName")} />
        </Field>
      </div>
      <Field id={id("last")} label="นามสกุล" error={errors.lastName}>
        <input id={id("last")} value={lastName} onChange={(e) => (setLastName(e.target.value), clear("lastName"))} className={FIELD} required autoComplete="off" {...invalid("lastName")} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={id("date")}
          label="วันที่ Offer"
          error={errors.offerDate}
          hint={`${offerDate ? `วันที่เลือก ${formatThaiDate(offerDate)} · ` : ""}${ctx.minDate ? `ย้อนหลังได้ไม่เกิน ${ctx.backdateDays} วัน` : "ผู้ดูแลระบบย้อนหลังได้ไม่จำกัด"}`}
        >
          <DatePicker id={id("date")} value={offerDate} min={ctx.minDate} max={ctx.today} onChange={(v) => (setOfferDate(v), clear("offerDate"))} {...invalid("offerDate")} />
        </Field>
        <Field id={id("channel")} label="Sourcing Channel" error={errors.channel} hint="กดแล้วพิมพ์เพื่อค้นหาได้">
          <Dropdown id={id("channel")} value={channel} onChange={(v) => (setChannel(v), clear("channel"))} options={ctx.channels.map((c) => ({ value: c, label: c }))} placeholder="เลือก Sourcing Channel" searchable searchPlaceholder="พิมพ์เพื่อค้นหา…" {...invalid("channel")} />
        </Field>
      </div>

      <Field id={id("phone")} label="เบอร์โทร (ไม่บังคับ)" error={errors.phone}>
        <input id={id("phone")} type="tel" inputMode="tel" value={phone} onChange={(e) => (setPhone(e.target.value), clear("phone"))} className={FIELD} autoComplete="off" {...invalid("phone")} />
      </Field>

      <div className="flex items-center justify-between rounded-2xl bg-muted px-4 py-3 text-sm" aria-live="polite">
        <span>
          TAT ณ วันที่ Offer {offerDate && <span className="text-muted-foreground">({formatThaiDate(offerDate)})</span>}
        </span>
        {tatAtDate !== null && (
          <span className="flex items-center gap-2">
            <b className="font-heading text-lg tabular-nums">{tatAtDate} วัน</b>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", meet ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive")}>
              {meet ? "Meet" : "Not Meet"}
            </span>
          </span>
        )}
      </div>

      <DialogFooter>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-full bg-ink-chip px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {pending ? "กำลังบันทึก…" : "บันทึก Offer"}
        </button>
      </DialogFooter>
    </form>
  );
}

function TurndownForm({ row, ctx, onDone }: { row: TrackingRow; ctx: EditContext; onDone: () => void }) {
  const uid = useId();
  const [date, setDate] = useState(ctx.today);
  const [reason, setReason] = useState("");
  const { pending, errors, run, clear } = useSubmit(onDone);
  const min = [ctx.minDate, row.offerDate ?? undefined].filter(Boolean).sort().at(-1);

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => submitTurndown(row.id, row.version, { date, reason }), `บันทึก Turndown แล้ว ${row.positionName} กลับเป็น ว่าง`);
      }}
    >
      <RowSummary row={row} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl ring-1 ring-border px-4 py-3 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">ผู้ได้รับ Offer</dt>
          <dd className="font-medium">{row.offerName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">วันที่ Offer</dt>
          <dd>{formatThaiDate(row.offerDate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Sourcing Channel</dt>
          <dd>{row.offerChannel || "-"}</dd>
        </div>
      </dl>
      <FormError message={errors.form} />

      <Field id={`${uid}-date`} label="วันที่ Turndown" error={errors.date} hint={`${date ? `วันที่เลือก ${formatThaiDate(date)}` : ""}${ctx.minDate ? ` · ย้อนหลังได้ไม่เกิน ${ctx.backdateDays} วัน` : ""}`}>
        <DatePicker id={`${uid}-date`} value={date} min={min} max={ctx.today} onChange={(v) => (setDate(v), clear("date"))} invalid={Boolean(errors.date)} />
      </Field>
      <Field id={`${uid}-reason`} label="เหตุผล" error={errors.reason}>
        <textarea
          id={`${uid}-reason`}
          value={reason}
          onChange={(e) => (setReason(e.target.value), clear("reason"))}
          rows={3}
          required
          className={cn(FIELD, "h-auto py-2")}
          placeholder="เช่น ได้งานที่อื่น / ไม่มารายงานตัว"
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        ข้อมูลผู้สมัครจะย้ายไปแท็บ Turndowns และตำแหน่งกลับเป็น “ว่าง” โดยนับ TAT ต่อจากวันที่แจ้งสรรหาเดิม ({formatThaiDate(row.requestDate)})
      </p>

      <DialogFooter>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-full bg-destructive px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {pending ? "กำลังบันทึก…" : "ยืนยัน Turndown"}
        </button>
      </DialogFooter>
    </form>
  );
}


const MAX_EDGE = 1600;

/** Re-encode large photos as JPEG at most 1600px on the long edge; files the browser can't decode (e.g. HEIC on Chrome) go as-is. */
async function shrinkImage(file: File): Promise<File> {
  if (file.size < 400 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function RequestForm({ row, ctx, type, onDone }: { row: TrackingRow; ctx: EditContext; type: "Cancel" | "Hold"; onDone: () => void }) {
  const uid = useId();
  const [date, setDate] = useState(ctx.today);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { pending, errors, run, clear } = useSubmit(onDone);
  const label = type === "Hold" ? "พัก (Hold)" : "ยกเลิก (Cancel)";

  const previewRef = useRef<string | null>(null);
  useEffect(() => () => void (previewRef.current && URL.revokeObjectURL(previewRef.current)), []);
  const pickFile = (f: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = f ? URL.createObjectURL(f) : null;
    setFile(f);
    setPreview(previewRef.current);
    clear("evidence");
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const form = new FormData();
          form.set("reqId", row.id);
          form.set("version", String(row.version));
          form.set("type", type);
          form.set("date", date);
          form.set("reason", reason);
          if (file) form.set("evidence", await shrinkImage(file));
          return submitApprovalRequest(form);
        }, `ส่งคำขอ${label}แล้ว รอผู้ดูแลอนุมัติ`);
      }}
    >
      <RowSummary row={row} />
      <FormError message={errors.form} />

      <Field
        id={`${uid}-date`}
        label="วันที่มีผล"
        error={errors.date}
        hint={`${date ? `วันที่เลือก ${formatThaiDate(date)}` : ""}${ctx.minDate ? ` · ย้อนหลังได้ไม่เกิน ${ctx.backdateDays} วัน` : ""}`}
      >
        <DatePicker id={`${uid}-date`} value={date} min={ctx.minDate} max={ctx.today} onChange={(v) => (setDate(v), clear("date"))} invalid={Boolean(errors.date)} />
      </Field>
      <Field id={`${uid}-reason`} label="เหตุผล" error={errors.reason}>
        <textarea
          id={`${uid}-reason`}
          value={reason}
          onChange={(e) => (setReason(e.target.value), clear("reason"))}
          rows={3}
          required
          className={cn(FIELD, "h-auto py-2")}
          placeholder={type === "Hold" ? "เช่น ร้านปิดปรับปรุงชั่วคราว" : "เช่น ลดอัตรากำลังตามแผน"}
        />
      </Field>

      <Field id={`${uid}-file`} label="รูปหลักฐาน (บังคับ)" error={errors.evidence} hint="JPG, PNG, WEBP หรือ HEIC ไม่เกิน 5MB">
        <label
          htmlFor={`${uid}-file`}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-input bg-white p-3 text-sm transition-colors hover:bg-muted has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
            errors.evidence && "border-destructive",
          )}
        >
          {preview && !/hei[cf]/.test(file?.type ?? "") ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="ตัวอย่างรูปหลักฐาน" className="size-16 shrink-0 rounded-xl object-cover" />
          ) : (
            <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
              <ImagePlus className="size-6" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium">{file ? file.name : "เลือกรูป หรือถ่ายรูป"}</span>
            <span className="text-xs text-muted-foreground">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · กดเพื่อเปลี่ยน` : "แตะเพื่อเลือกไฟล์"}</span>
          </span>
          <input
            id={`${uid}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            aria-invalid={errors.evidence ? true : undefined}
          />
        </label>
      </Field>
      <p className="text-xs text-muted-foreground">ตำแหน่งจะเป็น “รออนุมัติ” และยังนับเป็น vacancy จนกว่าผู้ดูแลระบบจะอนุมัติ</p>

      <DialogFooter>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-full bg-ink-chip px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {pending ? "กำลังส่ง…" : `ส่งคำขอ${label}`}
        </button>
      </DialogFooter>
    </form>
  );
}

/** super_admin only: request date and TA owner, each change logged with old -> new. */
function AdminEditForm({ row, ctx, onDone }: { row: TrackingRow; ctx: EditContext; onDone: () => void }) {
  const uid = useId();
  const [requestDate, setRequestDate] = useState(row.requestDate);
  const [taEmail, setTaEmail] = useState(row.taEmail.toLowerCase());
  const [reason, setReason] = useState("");
  const { pending, errors, run, clear } = useSubmit(onDone);
  const owners = ctx.assignable.some((o) => o.value === taEmail) || !taEmail ? ctx.assignable : [{ value: taEmail, label: `${row.taName} (ปิดใช้งานแล้ว)` }, ...ctx.assignable];

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => editRequisition(row.id, row.version, { requestDate, taEmail, reason }), "บันทึกการแก้ไขแล้ว");
      }}
    >
      <RowSummary row={row} />
      <FormError message={errors.form} />
      <Field id={`${uid}-date`} label="วันที่แจ้งสรรหา" error={errors.requestDate} hint={`วันที่เลือก ${formatThaiDate(requestDate || null)} · TAT และ Aging จะคำนวณใหม่จากวันนี้`}>
        <DatePicker id={`${uid}-date`} value={requestDate} onChange={(v) => (setRequestDate(v), clear("requestDate"))} invalid={Boolean(errors.requestDate)} />
      </Field>
      <Field id={`${uid}-ta`} label="TA เจ้าของ" error={errors.taEmail}>
        <Dropdown id={`${uid}-ta`} value={taEmail} onChange={(v) => (setTaEmail(v), clear("taEmail"))} options={owners} emptyLabel="ยังไม่มีเจ้าของ" invalid={Boolean(errors.taEmail)} />
      </Field>
      <Field id={`${uid}-reason`} label="เหตุผลที่แก้ไข" error={errors.reason}>
        <input id={`${uid}-reason`} value={reason} onChange={(e) => (setReason(e.target.value), clear("reason"))} className={FIELD} required placeholder="เช่น แก้ตามเอกสารขอกำลังคน" />
      </Field>
      <p className="text-xs text-muted-foreground">ค่าเดิมและค่าใหม่จะถูกบันทึกในประวัติของตำแหน่ง (Reports › ประวัติตำแหน่ง)</p>
      <DialogFooter>
        <button type="submit" disabled={pending} className="h-10 rounded-full bg-ink-chip px-6 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60">
          {pending ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
        </button>
      </DialogFooter>
    </form>
  );
}

type Action = "offer" | "Hold" | "Cancel" | "turndown" | "edit";
const ACTION_LABEL: Record<Action, string> = { offer: "กรอก Offer", Hold: "ขอพัก (Hold)", Cancel: "ขอยกเลิก", turndown: "ข้อมูล Offer", edit: "แก้ไข (ผู้ดูแล)" };
const ACTION_HINT: Record<Action, string> = {
  offer: "บันทึกผู้ได้รับ Offer ของตำแหน่งนี้",
  Hold: "ส่งคำขอพร้อมรูปหลักฐาน ให้ผู้ดูแลระบบอนุมัติ",
  Cancel: "ส่งคำขอพร้อมรูปหลักฐาน ให้ผู้ดูแลระบบอนุมัติ",
  turndown: "ถ้าผู้สมัครปฏิเสธ ให้บันทึก Turndown",
  edit: "แก้วันที่แจ้งสรรหาหรือเปลี่ยน TA เจ้าของ",
};

function actionsFor(target: NonNullable<DialogTarget>, ctx: EditContext): Action[] {
  const base: Action[] = target.mode === "offer" ? ["offer", "Hold", "Cancel"] : target.mode === "turndown" ? ["turndown"] : [];
  return ctx.isAdmin ? [...base, "edit"] : base;
}

export function RequisitionDialog({ target, ctx, onClose }: { target: DialogTarget; ctx: EditContext; onClose: () => void }) {
  const [action, setAction] = useState<Action>("offer");
  const [openFor, setOpenFor] = useState<string | null>(null);
  const actions = target ? actionsFor(target, ctx) : [];
  // Each time a row is opened, start on its first tab.
  if (target && target.row.id !== openFor) {
    setOpenFor(target.row.id);
    setAction(actions[0] ?? "edit");
  }

  const close = () => {
    setOpenFor(null);
    onClose();
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl p-6 [&::-webkit-scrollbar-track]:my-5 sm:max-w-lg">
        {target && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-xl font-medium">
                {ACTION_LABEL[action]} · {target.row.positionName}
              </DialogTitle>
              <DialogDescription>{ACTION_HINT[action]}</DialogDescription>
            </DialogHeader>
            {actions.length > 1 && (
              <div role="tablist" aria-label="เลือกการทำรายการ" className="flex flex-wrap gap-1 rounded-full bg-muted p-1">
                {actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="tab"
                    aria-selected={action === a}
                    onClick={() => setAction(a)}
                    className={cn(
                      "flex-1 rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      action === a ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {ACTION_LABEL[a]}
                  </button>
                ))}
              </div>
            )}
            {/* key resets the form when another row or tab is opened */}
            {action === "turndown" ? (
              <TurndownForm key={target.row.id} row={target.row} ctx={ctx} onDone={close} />
            ) : action === "offer" ? (
              <OfferForm key={target.row.id} row={target.row} ctx={ctx} onDone={close} />
            ) : action === "edit" ? (
              <AdminEditForm key={`${target.row.id}-edit`} row={target.row} ctx={ctx} onDone={close} />
            ) : (
              <RequestForm key={`${target.row.id}-${action}`} row={target.row} ctx={ctx} type={action} onDone={close} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
