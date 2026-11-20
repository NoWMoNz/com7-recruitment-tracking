import { formatThaiDate, parseUserDate } from "./dates";
import { backdateError, type Plan } from "./offer";
import { canEditRequisition } from "./permissions";
import type { AppSettings } from "./settings";
import type { Approval, ApprovalType, LocalDate, Requisition, Status, StatusLogEntry, User } from "./types";

const PENDING: Record<ApprovalType, Status> = { Cancel: "PendingCancel", Hold: "PendingHold" };
export const APPROVAL_LABEL: Record<ApprovalType, string> = { Cancel: "ยกเลิก", Hold: "พัก (Hold)" };

function log(p: Omit<StatusLogEntry, "note" | "ref_id"> & Partial<Pick<StatusLogEntry, "note" | "ref_id">>): StatusLogEntry {
  return { note: "", ref_id: "", ...p };
}

/** Vacancy -> PendingCancel / PendingHold. Evidence is mandatory; the requisition still counts until approved. */
export function planRequest(args: {
  req: Requisition;
  type: ApprovalType;
  input: { date: string; reason: string };
  evidenceRef: string | null;
  viewer: User;
  today: LocalDate;
  settings: AppSettings;
  ids: { approvalId: string; logId: string };
  now: Date;
}): Plan<{ approval: Approval; reqPatch: Partial<Requisition>; logEntry: StatusLogEntry }> {
  const { req, type, viewer, ids, now } = args;
  if (!canEditRequisition(viewer, req)) return { ok: false, errors: { form: "คุณไม่ได้เป็นผู้รับผิดชอบตำแหน่งนี้" } };
  if (req.status !== "Vacancy") {
    const hint = req.status === "Offer" ? " ถ้ามีคน Offer อยู่ ต้องบันทึก Turndown ก่อน" : "";
    return { ok: false, errors: { form: `ขอ ${APPROVAL_LABEL[type]} ได้เฉพาะตำแหน่งที่สถานะเป็น ว่าง${hint}` } };
  }

  const errors: Record<string, string> = {};
  const reason = args.input.reason.trim();
  if (!reason) errors.reason = "กรอกเหตุผล";
  if (!args.evidenceRef) errors.evidence = "ต้องแนบรูปหลักฐาน";
  const date = parseUserDate(args.input.date);
  if (!date) errors.date = "กรุณาเลือกวันที่";
  else {
    const err = backdateError(date, args.today, args.settings.backdateDays, viewer.role);
    if (err) errors.date = err;
  }
  if (Object.keys(errors).length > 0 || !date || !args.evidenceRef) return { ok: false, errors };

  const at = now.toISOString();
  const to = PENDING[type];
  return {
    ok: true,
    value: {
      approval: {
        id: ids.approvalId,
        req_id: req.id,
        type,
        reason,
        effective_date: date,
        evidence_url: args.evidenceRef,
        requested_by: viewer.email,
        requested_at: at,
        status: "Pending",
        decided_by: "",
        decided_at: "",
        decision_note: "",
      },
      reqPatch: { status: to, status_date: date },
      logEntry: log({ id: ids.logId, req_id: req.id, from_status: "Vacancy", to_status: to, effective_date: date, actor: viewer.email, at, note: reason, ref_id: ids.approvalId }),
    },
  };
}

/**
 * super_admin decision on a pending request. Approve: the requisition becomes Cancel (closed) or Hold from the
 * requested effective date, so hold days start then. Reject: back to Vacancy, a note is required.
 */
export function planDecision(args: {
  req: Requisition;
  approval: Approval;
  decision: "approve" | "reject";
  note: string;
  viewer: User;
  today: LocalDate;
  ids: { logId: string };
  now: Date;
}): Plan<{ approvalPatch: Partial<Approval>; reqPatch: Partial<Requisition>; logEntry: StatusLogEntry }> {
  const { req, approval, decision, viewer, ids, now } = args;
  if (viewer.role !== "super_admin") return { ok: false, errors: { form: "เฉพาะผู้ดูแลระบบเท่านั้นที่อนุมัติได้" } };
  if (approval.status !== "Pending") return { ok: false, errors: { form: "คำขอนี้ถูกตัดสินไปแล้ว กรุณาโหลดใหม่" } };
  if (approval.req_id !== req.id || req.status !== PENDING[approval.type]) {
    return { ok: false, errors: { form: "สถานะของตำแหน่งไม่ตรงกับคำขอ กรุณาโหลดใหม่" } };
  }
  const note = args.note.trim();
  if (decision === "reject" && !note) return { ok: false, errors: { note: "กรอกเหตุผลที่ไม่อนุมัติ" } };

  const at = now.toISOString();
  const approvalPatch: Partial<Approval> = { status: decision === "approve" ? "Approved" : "Rejected", decided_by: viewer.email, decided_at: at, decision_note: note };
  if (decision === "reject") {
    return {
      ok: true,
      value: {
        approvalPatch,
        reqPatch: { status: "Vacancy", status_date: args.today },
        logEntry: log({ id: ids.logId, req_id: req.id, from_status: req.status, to_status: "Vacancy", effective_date: args.today, actor: viewer.email, at, note: `ไม่อนุมัติ: ${note}`, ref_id: approval.id }),
      },
    };
  }
  const to: Status = approval.type;
  return {
    ok: true,
    value: {
      approvalPatch,
      reqPatch: { status: to, status_date: approval.effective_date, ...(to === "Cancel" ? { closed_at: approval.effective_date } : {}) },
      logEntry: log({ id: ids.logId, req_id: req.id, from_status: req.status, to_status: to, effective_date: approval.effective_date, actor: viewer.email, at, note: note || "อนุมัติ", ref_id: approval.id }),
    },
  };
}

/** Date the current hold started (latest move into Hold), or null. */
export function holdStart(log: StatusLogEntry[], reqId: string): LocalDate | null {
  const entries = log.filter((e) => e.req_id === reqId && e.to_status === "Hold").map((e) => e.effective_date);
  return entries.length ? entries.sort().at(-1)! : null;
}

/** Hold -> Vacancy. TAT resumes; the hold period is excluded because it is in the log. */
export function planResume(args: {
  req: Requisition;
  input: { date: string };
  log: StatusLogEntry[];
  viewer: User;
  today: LocalDate;
  settings: AppSettings;
  ids: { logId: string };
  now: Date;
}): Plan<{ reqPatch: Partial<Requisition>; logEntry: StatusLogEntry }> {
  const { req, viewer, ids, now } = args;
  if (!canEditRequisition(viewer, req)) return { ok: false, errors: { form: "คุณไม่ได้เป็นผู้รับผิดชอบตำแหน่งนี้" } };
  if (req.status !== "Hold") return { ok: false, errors: { form: "ตำแหน่งนี้ไม่ได้อยู่ในสถานะพักแล้ว กรุณาโหลดใหม่" } };
  const date = parseUserDate(args.input.date);
  if (!date) return { ok: false, errors: { date: "กรุณาเลือกวันที่" } };
  const err = backdateError(date, args.today, args.settings.backdateDays, viewer.role);
  if (err) return { ok: false, errors: { date: err } };
  const since = holdStart(args.log, req.id);
  if (since && date < since) return { ok: false, errors: { date: `ต้องไม่ก่อนวันที่เริ่มพัก (${formatThaiDate(since)})` } };

  return {
    ok: true,
    value: {
      reqPatch: { status: "Vacancy", status_date: date },
      logEntry: log({ id: ids.logId, req_id: req.id, from_status: "Hold", to_status: "Vacancy", effective_date: date, actor: viewer.email, at: now.toISOString(), note: "Resume" }),
    },
  };
}
