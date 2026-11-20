import { addDays, formatThaiDate, parseUserDate } from "./dates";
import { canEditRequisition } from "./permissions";
import type { AppSettings } from "./settings";
import { computeTat, holdDays } from "./tat";
import type { LocalDate, Offer, Requisition, Role, StatusLogEntry, Turndown, User } from "./types";

export const TITLES = ["นาย", "นาง", "นางสาว"] as const;

export type Plan<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

/** Status-change dates: never in the future; at most `backdateDays` back unless super_admin. */
export function backdateError(date: LocalDate, today: LocalDate, backdateDays: number, role: Role): string | null {
  if (date > today) return "ห้ามลงวันที่ล่วงหน้า";
  if (role !== "super_admin" && date < addDays(today, -backdateDays)) {
    return `ย้อนหลังได้ไม่เกิน ${backdateDays} วัน (ไม่ก่อน ${formatThaiDate(addDays(today, -backdateDays))})`;
  }
  return null;
}

/** Earliest date the viewer may pick, for the date input's `min`. */
export function earliestDate(today: LocalDate, backdateDays: number, role: Role): LocalDate | undefined {
  return role === "super_admin" ? undefined : addDays(today, -backdateDays);
}

export interface OfferInput {
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** yyyy-mm-dd or dd/mm/yyyy */
  offerDate: string;
  channel: string;
}

function checkDate(raw: string, today: LocalDate, settings: AppSettings, viewer: User, errors: Record<string, string>, key: string): LocalDate | null {
  const d = parseUserDate(raw);
  if (!d) {
    errors[key] = "กรุณาเลือกวันที่";
    return null;
  }
  const err = backdateError(d, today, settings.backdateDays, viewer.role);
  if (err) errors[key] = err;
  return d;
}

export function planOffer(args: {
  req: Requisition;
  input: OfferInput;
  viewer: User;
  today: LocalDate;
  settings: AppSettings;
  channels: string[];
  log: StatusLogEntry[];
  ids: { offerId: string; logId: string };
  now: Date;
}): Plan<{ offer: Offer; reqPatch: Partial<Requisition>; logEntry: StatusLogEntry }> {
  const { req, input, viewer, today, settings, ids, now } = args;
  if (!canEditRequisition(viewer, req)) return { ok: false, errors: { form: "คุณไม่ได้เป็นผู้รับผิดชอบตำแหน่งนี้" } };
  if (req.status !== "Vacancy") return { ok: false, errors: { form: "กรอก Offer ได้เฉพาะตำแหน่งที่สถานะเป็น ว่าง" } };

  const errors: Record<string, string> = {};
  const title = input.title.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phone = input.phone.trim();
  const channel = input.channel.trim();
  if (!(TITLES as readonly string[]).includes(title)) errors.title = "เลือกคำนำหน้า";
  if (!firstName) errors.firstName = "กรอกชื่อ";
  if (!lastName) errors.lastName = "กรอกนามสกุล";
  if (phone && !/^[0-9+\-\s]{9,15}$/.test(phone)) errors.phone = "เบอร์โทรไม่ถูกต้อง";
  if (!args.channels.includes(channel)) errors.channel = "เลือก Sourcing Channel จากรายการ";
  const offerDate = checkDate(input.offerDate, today, settings, viewer, errors, "offerDate");
  if (Object.keys(errors).length > 0 || !offerDate) return { ok: false, errors };

  const tat = computeTat({ requestDate: req.request_date, endDate: offerDate, holdDays: holdDays(args.log, req.id, offerDate) });
  const at = now.toISOString();
  return {
    ok: true,
    value: {
      offer: {
        id: ids.offerId,
        req_id: req.id,
        title,
        first_name: firstName,
        last_name: lastName,
        phone,
        offer_date: offerDate,
        sourcing_channel: channel,
        tat_at_offer: tat,
        ta_email: req.ta_email,
        created_by: viewer.email,
        created_at: at,
      },
      reqPatch: { status: "Offer", status_date: offerDate, offer_id: ids.offerId },
      logEntry: {
        id: ids.logId,
        req_id: req.id,
        from_status: "Vacancy",
        to_status: "Offer",
        effective_date: offerDate,
        actor: viewer.email,
        at,
        note: "",
        ref_id: ids.offerId,
      },
    },
  };
}

export function planTurndown(args: {
  req: Requisition;
  offer: Offer | null;
  input: { date: string; reason: string };
  viewer: User;
  today: LocalDate;
  settings: AppSettings;
  ids: { logId: string };
  now: Date;
}): Plan<{ turndown: Turndown; reqPatch: Partial<Requisition>; logEntry: StatusLogEntry }> {
  const { req, offer, viewer, today, settings, ids, now } = args;
  if (!canEditRequisition(viewer, req)) return { ok: false, errors: { form: "คุณไม่ได้เป็นผู้รับผิดชอบตำแหน่งนี้" } };
  if (req.status !== "Offer" || !offer || offer.id !== req.offer_id) {
    return { ok: false, errors: { form: "ตำแหน่งนี้ไม่ได้อยู่ในสถานะ Offer แล้ว กรุณาโหลดใหม่" } };
  }

  const errors: Record<string, string> = {};
  const reason = args.input.reason.trim();
  if (!reason) errors.reason = "กรอกเหตุผล";
  const date = checkDate(args.input.date, today, settings, viewer, errors, "date");
  if (date && !errors.date && date < offer.offer_date) errors.date = `ต้องไม่ก่อนวันที่ Offer (${formatThaiDate(offer.offer_date)})`;
  if (Object.keys(errors).length > 0 || !date) return { ok: false, errors };

  const at = now.toISOString();
  return {
    ok: true,
    value: {
      turndown: { ...offer, turndown_date: date, reason, recorded_by: viewer.email },
      // request_date is untouched, so TAT keeps counting from the original request.
      reqPatch: { status: "Vacancy", status_date: date, offer_id: "" },
      logEntry: {
        id: ids.logId,
        req_id: req.id,
        from_status: "Offer",
        to_status: "Vacancy",
        effective_date: date,
        actor: viewer.email,
        at,
        note: `Turndown: ${reason}`,
        ref_id: offer.id,
      },
    },
  };
}
