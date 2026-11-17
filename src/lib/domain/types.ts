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

export interface Branch {
  branch_code: string;
  branch_name: string;
  brand: string;
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

export interface SettingRow {
  key: string;
  value: string;
}
