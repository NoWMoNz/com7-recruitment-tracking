/** Calendar date as "YYYY-MM-DD" (Bangkok local date). Never a JS Date across module boundaries. */
export type LocalDate = string;

export type Status =
  | "Vacancy"
  | "Offer"
  | "PendingCancel"
  | "PendingHold"
  | "Hold"
  | "Cancel"
  | "Hired"
  | "Transfer";

export const ON_PROCESS: readonly Status[] = ["Vacancy", "Offer", "PendingCancel", "PendingHold"];

export type Role = "super_admin" | "ta" | "viewer";

export interface Requisition {
  id: string;
  branch_code: string;
  position_code: string;
  request_date: LocalDate;
  source: string;
  source_ref: string;
  ta_email: string;
  status: Status;
  status_date: LocalDate | null;
  offer_id: string;
  closed_at: LocalDate | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Offer {
  id: string;
  req_id: string;
  title: string;
  first_name: string;
  last_name: string;
  phone: string;
  offer_date: LocalDate;
  sourcing_channel: string;
  tat_at_offer: number;
  ta_email: string;
  created_by: string;
  created_at: string;
}

export type ApprovalType = "Cancel" | "Hold";
export type ApprovalStatus = "Pending" | "Approved" | "Rejected";

/** A TA's request to Cancel or Hold a requisition, decided by a super_admin. */
export interface Approval {
  id: string;
  req_id: string;
  type: ApprovalType;
  reason: string;
  effective_date: LocalDate;
  /** Evidence store reference (private Blob URL, or "local:<id>" in dev). */
  evidence_url: string;
  requested_by: string;
  requested_at: string;
  status: ApprovalStatus;
  decided_by: string;
  decided_at: string;
  decision_note: string;
}

/** An Offer moved out of `Offers` when the candidate turned it down. */
export interface Turndown extends Offer {
  turndown_date: LocalDate;
  reason: string;
  recorded_by: string;
}

export interface StatusLogEntry {
  id: string;
  req_id: string;
  from_status: string;
  to_status: string;
  effective_date: LocalDate;
  actor: string;
  at: string;
  note: string;
  ref_id: string;
}

/** Shown for a branch whose business unit is not filled in yet. */
export const UNKNOWN_BU = "ไม่ระบุ BU";
/** A branch's business unit, or UNKNOWN_BU. */
export const buOf = (b: { bu?: string } | undefined) => b?.bu?.trim() || UNKNOWN_BU;

export interface Branch {
  branch_code: string;
  branch_name: string;
  brand: string;
  /** Business unit ("Group ใหญ่" in HR's file), e.g. Apple, BaNANA, iCare. Empty = not set. */
  bu: string;
  province: string;
  region: string;
  status: "Open" | "Closed" | "Project";
  open_date: LocalDate | null;
  close_date: LocalDate | null;
}

export interface Position {
  position_code: string;
  position_name: string;
  position_group: string;
  sla_days: number | null;
}

export interface User {
  email: string;
  name: string;
  role: Role;
  scope: string;
  active: boolean;
}

/** Hired person: the Offer plus what HR's new-employee data adds. */
export interface NewHire extends Offer {
  employee_id: string;
  start_date: LocalDate | null;
  hired_at: LocalDate;
  tat: number;
  tat_result: string;
}

/** HR's headcount for one branch and position: the quota and the people actually there (from the latest HR report). */
export interface QuotaLine {
  branch_code: string;
  position_code: string;
  quota: number;
  actual: number;
  report_date: LocalDate;
}

export type ReviewType = "UnmatchedHire" | "TransferNoReq" | "OfferAtClosedStore" | "ResignWithdrawn";

/** Something the processor could not decide on its own; super_admin resolves it in the web. */
export interface ReviewItem {
  id: string;
  type: ReviewType;
  /** Stable key of the source event, so re-running the processor doesn't add the same item twice. */
  ref: string;
  detail: string;
  resolved_by: string;
  resolved_at: string;
}

/** Rows pasted by super_admin into the Import_* tabs (fixed headers). */
export interface ImportInitial {
  branch_code: string;
  position_code: string;
  request_date: LocalDate | null;
  ta_email: string;
  status: string;
  title: string;
  first_name: string;
  last_name: string;
  offer_date: LocalDate | null;
  sourcing_channel: string;
  hold_since: LocalDate | null;
  processed_at: string;
}

export interface ImportRequisition {
  branch_code: string;
  position_code: string;
  headcount: number | null;
  request_date: LocalDate | null;
  source: string;
  note: string;
  processed_at: string;
}

export interface ImportResign {
  employee_id: string;
  title: string;
  first_name: string;
  last_name: string;
  branch_code: string;
  position_code: string;
  effective_date: LocalDate | null;
  processed_at: string;
  /** Set when the resignation was withdrawn (ยกเลิกลาออก); empty = still a resignation. */
  cancelled_at: string;
  cancelled_by: string;
  cancel_note: string;
}

export interface ImportTransfer {
  employee_id: string;
  title: string;
  first_name: string;
  last_name: string;
  from_branch: string;
  from_position: string;
  to_branch: string;
  to_position: string;
  effective_date: LocalDate | null;
  processed_at: string;
}

export interface ImportNewEmployee {
  employee_id: string;
  title: string;
  first_name: string;
  last_name: string;
  branch_code: string;
  position_code: string;
  start_date: LocalDate | null;
  processed_at: string;
  matched_req_id: string;
}

/** Frozen monthly figures per TA and region, written when a month is closed. */
export interface MonthlySnapshot {
  /** "YYYY-MM" */
  month: string;
  ta_email: string;
  region: string;
  carried_in: number;
  new: number;
  total: number;
  closed: number;
  cancel: number;
  hold: number;
  offer_pending: number;
  remaining: number;
  tat_meet: number;
  tat_total: number;
  computed_at: string;
}

export interface SettingRow {
  key: string;
  value: string;
}
