import { branchLabel, peopleOfBranch, taOf } from "./people";
import { formatThaiDate, parseUserDate, todayBangkok } from "./dates";
import type { Plan } from "./offer";
import { inScope, normalizeEmail } from "./permissions";
import type { Numbered } from "./processor";
import { buOf, type Branch, type ImportResign, type LocalDate, type Offer, type Position, type Requisition, type ReviewItem, type Status, type StatusLogEntry, type User } from "./types";

/** รอถึงวันมีผล / ลาออกแล้ว / ยกเลิกลาออก */
export type ResignState = "upcoming" | "resigned" | "withdrawn";
export const RESIGN_STATE_LABEL: Record<ResignState, string> = { upcoming: "รอถึงวันมีผล", resigned: "ลาออกแล้ว", withdrawn: "ยกเลิกลาออก" };
export type WithdrawOutcome = "cancelled" | "review" | "recorded";

export interface ResignRow {
  /** Sheet row of Import_Resign (the tab has no id column). */
  rowNumber: number;
  employeeId: string;
  name: string;
  bu: string;
  region: string;
  province: string;
  /** Area / Regional Manager of the branch; "" when not set. */
  am: string;
  rm: string;
  branchCode: string;
  branchName: string;
  positionName: string;
  effectiveDate: LocalDate;
  state: ResignState;
  cancelledAt: string;
  /** The withdrawal day as dd/mm/yyyy (Bangkok); a value someone typed into the sheet by hand that is not a timestamp is shown as typed. */
  cancelledDay: string;
  /** Display name of whoever withdrew it. */
  cancelledBy: string;
  cancelNote: string;
  /** The requisition the processor opened for this resignation, if it can be found. */
  reqId: string | null;
  reqStatus: Status | null;
  /** Owner (email) of that requisition; "" when there is none. */
  reqTaEmail: string;
  /** TA key and name the row is shown and filtered under: the shop's TA, else that requisition's owner (see taOf). */
  ta: string;
  taName: string;
  canWithdraw: boolean;
}

export interface ResignFilter {
  bu?: string;
  region?: string;
  state?: ResignState;
  /** Effective date range, both ends inclusive; an open end is unbounded. */
  from?: LocalDate;
  to?: LocalDate;
  q?: string;
}

const UNKNOWN_REGION = "ไม่ระบุ";

/** The `source_ref` the processor gives the requisition it opens for a resignation. */
export const resignRef = (r: Pick<ImportResign, "employee_id" | "effective_date">): string => `RESIGN:${r.employee_id.trim()}:${r.effective_date}`;

/** dd/mm/yyyy of an ISO timestamp, in Bangkok; anything that is not a timestamp is returned as it is. */
export function stampDay(stamp: string): string {
  const t = Date.parse(stamp);
  return Number.isNaN(t) ? stamp : formatThaiDate(todayBangkok(new Date(t)));
}

const fullName = (r: Pick<ImportResign, "title" | "first_name" | "last_name">) => `${r.title}${r.first_name} ${r.last_name}`.trim();

/** Processed resignations the viewer may see, newest effective date first. */
export function buildResignRows(
  d: { resign: Numbered<ImportResign>[]; requisitions: Requisition[]; branches: Branch[]; positions: Position[]; users: User[] },
  viewer: User,
  today: LocalDate,
): ResignRow[] {
  const branches = new Map(d.branches.map((b) => [b.branch_code, b]));
  const positions = new Map(d.positions.map((p) => [p.position_code, p]));
  const users = new Map(d.users.map((u) => [normalizeEmail(u.email), u]));
  const reqByRef = new Map(d.requisitions.filter((r) => r.source_ref).map((r) => [r.source_ref, r]));
  const rows: ResignRow[] = [];

  for (const { rowNumber, row } of d.resign) {
    if (!row.processed_at || !row.effective_date) continue;
    const b = branches.get(row.branch_code);
    if (!inScope(viewer, b ?? { region: UNKNOWN_REGION, branch_code: row.branch_code })) continue;
    const linkedReq = reqByRef.get(resignRef(row));
    const withdrawn = Boolean(row.cancelled_at);
    rows.push({
      rowNumber,
      employeeId: row.employee_id.trim(),
      name: fullName(row),
      bu: buOf(b),
      region: b?.region || UNKNOWN_REGION,
      province: b?.province ?? "",
      ...peopleOfBranch(b),
      branchCode: row.branch_code,
      branchName: branchLabel(row.branch_code, b),
      positionName: positions.get(row.position_code)?.position_name || row.position_code,
      effectiveDate: row.effective_date,
      state: withdrawn ? "withdrawn" : row.effective_date > today ? "upcoming" : "resigned",
      cancelledAt: row.cancelled_at,
      cancelledDay: withdrawn ? stampDay(row.cancelled_at) : "",
      cancelledBy: withdrawn ? users.get(normalizeEmail(row.cancelled_by))?.name || row.cancelled_by : "",
      cancelNote: row.cancel_note,
      reqId: linkedReq?.id ?? null,
      reqStatus: linkedReq?.status ?? null,
      reqTaEmail: linkedReq?.ta_email ?? "",
      ...taOf(b, linkedReq?.ta_email ?? "", (e) => users.get(e)?.name),
      canWithdraw: !withdrawn && (viewer.role === "ta" || viewer.role === "super_admin"),
    });
  }
  return rows.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || a.employeeId.localeCompare(b.employeeId));
}

export function filterResignRows(rows: ResignRow[], f: ResignFilter): ResignRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.bu && r.bu !== f.bu) return false;
    if (f.region && r.region !== f.region) return false;
    if (f.state && r.state !== f.state) return false;
    if (f.from && r.effectiveDate < f.from) return false;
    if (f.to && r.effectiveDate > f.to) return false;
    if (q && !`${r.name} ${r.employeeId} ${r.branchName} ${r.branchCode} ${r.positionName}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** The reason goes into a log row and a sheet cell; a cap keeps a pasted essay from failing the write half-way. */
export const NOTE_MAX = 500;

const OPEN_STILL: readonly Status[] = ["Offer", "Hold", "PendingCancel", "PendingHold"];

/**
 * What withdrawing a resignation does. The resignation is always marked on its import row. A Vacancy is closed
 * as Cancel at once (no approval, no evidence); any other open status is left alone and sent to review;
 * a closed or missing requisition is not touched.
 */
export function planWithdrawal(args: {
  row: ImportResign;
  branch: Branch | undefined;
  req: Requisition | null;
  /** Status-log rows of `req` (only used to notice a Cancel whose log row was never written). */
  log: readonly StatusLogEntry[];
  /** The Offer on `req`, used only to name the person in the review note. */
  offer: Offer | null;
  /** `ref` of every review item already on the queue. */
  reviewRefs: ReadonlySet<string>;
  viewer: User;
  note: string;
  today: LocalDate;
  ids: { logId: string; reviewId: string };
  now: Date;
}): Plan<{ importPatch: Partial<ImportResign>; reqPatch: Partial<Requisition> | null; logEntry: StatusLogEntry | null; review: ReviewItem | null; outcome: WithdrawOutcome }> {
  const { row, req, viewer, today, ids, now } = args;
  const fail = (errors: Record<string, string>) => ({ ok: false as const, errors });

  if (viewer.role !== "ta" && viewer.role !== "super_admin") return fail({ form: "คุณไม่มีสิทธิ์ยกเลิกลาออก" });
  if (!inScope(viewer, args.branch ?? { region: UNKNOWN_REGION, branch_code: row.branch_code })) return fail({ form: "สาขานี้อยู่นอกขอบเขตของคุณ" });
  if (!row.processed_at) return fail({ form: "รายการนี้ยังไม่ได้ประมวลผล" });
  if (row.cancelled_at) return fail({ form: "รายการนี้ยกเลิกลาออกไปแล้ว" });
  const note = args.note.trim();
  if (!note) return fail({ note: "กรอกเหตุผลที่ยกเลิกลาออก" });
  if (note.length > NOTE_MAX) return fail({ note: `เหตุผลยาวได้ไม่เกิน ${NOTE_MAX} ตัวอักษร` });

  const at = now.toISOString();
  const ref = resignRef(row);
  const importPatch: Partial<ImportResign> = { cancelled_at: at, cancelled_by: viewer.email, cancel_note: note };
  const done = (outcome: WithdrawOutcome, extra: { reqPatch?: Partial<Requisition>; logEntry?: StatusLogEntry; review?: ReviewItem } = {}) => ({
    ok: true as const,
    value: { importPatch, reqPatch: extra.reqPatch ?? null, logEntry: extra.logEntry ?? null, review: extra.review ?? null, outcome },
  });

  if (!req) return done("recorded");

  if (req.status === "Vacancy") {
    // A resignation that has not taken effect yet has a request date in the future: close on that day, not before it began.
    const date = req.request_date > today ? req.request_date : today;
    return done("cancelled", {
      reqPatch: { status: "Cancel", status_date: date, closed_at: date },
      logEntry: { id: ids.logId, req_id: req.id, from_status: "Vacancy", to_status: "Cancel", effective_date: date, actor: viewer.email, at, note: `ยกเลิกลาออก: ${note}`, ref_id: ref },
    });
  }

  if (OPEN_STILL.includes(req.status)) {
    const reviewRef = `RESIGNWD:${ref}`;
    if (args.reviewRefs.has(reviewRef)) return done("review");
    const who = `${fullName(row)} (${row.employee_id.trim()})`;
    const state = req.status === "Offer" && args.offer ? `มีคน Offer แล้ว: ${args.offer.title}${args.offer.first_name} ${args.offer.last_name}` : `อยู่ในสถานะ ${req.status}`;
    return done("review", {
      review: {
        id: ids.reviewId,
        type: "ResignWithdrawn",
        ref: reviewRef,
        detail: `${who} ยกเลิกลาออก (มีผล ${formatThaiDate(row.effective_date)}) แต่ตำแหน่ง ${req.id} (สาขา ${row.branch_code} ตำแหน่ง ${row.position_code})${state} ต้องตัดสินใจว่าจะทำอย่างไรต่อ`,
        resolved_by: "",
        resolved_at: "",
      },
    });
  }

  // Already Cancel, but its Cancel log row is missing: an earlier attempt closed it and then failed before logging.
  // Reports rebuild history from the log, so write the row now. A requisition cancelled by any other route has its own row.
  if (req.status === "Cancel" && !args.log.some((e) => e.req_id === req.id && e.to_status === "Cancel")) {
    const date = req.closed_at ?? req.status_date ?? today;
    return done("cancelled", {
      logEntry: { id: ids.logId, req_id: req.id, from_status: "Vacancy", to_status: "Cancel", effective_date: date, actor: viewer.email, at, note: `ยกเลิกลาออก: ${note}`, ref_id: ref },
    });
  }

  return done("recorded");
}

export const RESIGN_TITLES = ["นาย", "นาง", "นางสาว"] as const;

export interface NewResignInput {
  employeeId: string;
  title: string;
  firstName: string;
  lastName: string;
  branchCode: string;
  positionCode: string;
  /** yyyy-mm-dd, or dd/mm/yyyy as typed. */
  effectiveDate: string;
}

/**
 * A resignation typed in the web instead of the Import_Resign tab. The row is left unprocessed; processing turns it
 * into a requisition dated the effective date, exactly as for a row typed in the Sheet.
 */
export function planNewResignation(args: {
  input: NewResignInput;
  /** Rows already in Import_Resign, to refuse the same person and date twice. */
  existing: readonly ImportResign[];
  branches: readonly Branch[];
  positions: readonly Position[];
  viewer: User;
}): Plan<{ row: ImportResign }> {
  const { input, viewer } = args;
  if (viewer.role !== "ta" && viewer.role !== "super_admin") return { ok: false, errors: { form: "คุณไม่มีสิทธิ์เพิ่มรายชื่อลาออก" } };
  const errors: Record<string, string> = {};
  const text = (v: unknown) => String(v ?? "").trim();
  const employeeId = text(input.employeeId);
  const firstName = text(input.firstName);
  const lastName = text(input.lastName);
  const title = text(input.title);
  const branchCode = text(input.branchCode);
  const positionCode = text(input.positionCode);

  if (!employeeId) errors.employeeId = "กรอกรหัสพนักงาน";
  else if (employeeId.length > 30) errors.employeeId = "รหัสพนักงานยาวเกินไป";
  if (!(RESIGN_TITLES as readonly string[]).includes(title)) errors.title = "เลือกคำนำหน้า";
  if (!firstName) errors.firstName = "กรอกชื่อ";
  else if (firstName.length > 80) errors.firstName = "ชื่อยาวเกินไป";
  if (!lastName) errors.lastName = "กรอกนามสกุล";
  else if (lastName.length > 80) errors.lastName = "นามสกุลยาวเกินไป";

  const branch = args.branches.find((b) => b.branch_code === branchCode);
  if (!branch) errors.branchCode = "เลือกสาขา";
  else if (branch.status === "Closed") errors.branchCode = "สาขานี้ปิดแล้ว";
  else if (!inScope(viewer, branch)) errors.branchCode = "สาขานี้อยู่นอกขอบเขตของคุณ";
  if (!args.positions.some((p) => p.position_code === positionCode)) errors.positionCode = "เลือกตำแหน่ง";

  const effectiveDate = parseUserDate(text(input.effectiveDate));
  if (!effectiveDate) errors.effectiveDate = "เลือกวันที่มีผล";

  if (!errors.employeeId && effectiveDate && args.existing.some((r) => r.employee_id.trim() === employeeId && r.effective_date === effectiveDate)) {
    errors.employeeId = `มีรายชื่อรหัส ${employeeId} ที่มีผลวันที่ ${formatThaiDate(effectiveDate)} อยู่แล้ว`;
  }
  if (Object.keys(errors).length || !effectiveDate) return { ok: false, errors };

  return {
    ok: true,
    value: {
      row: {
        employee_id: employeeId,
        title,
        first_name: firstName,
        last_name: lastName,
        branch_code: branchCode,
        position_code: positionCode,
        effective_date: effectiveDate,
        processed_at: "",
        cancelled_at: "",
        cancelled_by: "",
        cancel_note: "",
      },
    },
  };
}
