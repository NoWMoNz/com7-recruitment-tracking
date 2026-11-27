import type { Branch, Offer, Position, Requisition, StatusLogEntry, User } from "@/lib/domain/types";

export function req(p: Partial<Requisition> & Pick<Requisition, "id">): Requisition {
  return {
    branch_code: "BKK-012", position_code: "SALES", request_date: "2026-10-02", source: "Resign", source_ref: "",
    ta_email: "mind@example.com", ta_name: "", status: "Vacancy", status_date: null, offer_id: "", closed_at: null, version: 1,
    created_at: "", updated_at: "", ...p,
  };
}

export function branch(p: Partial<Branch> & Pick<Branch, "branch_code">): Branch {
  return { branch_name: p.branch_code, brand: "Studio7", bu: "Apple", province: "กรุงเทพฯ", region: "ภาคกลาง", status: "Open",
    open_date: null, close_date: null, am: "", rm: "", full_name: "", ta: "", ...p };
}

export function user(p: Partial<User> & Pick<User, "email">): User {
  return { name: p.email.split("@")[0], role: "ta", scope: "", active: true, ...p };
}

export function offer(p: Partial<Offer> & Pick<Offer, "id" | "req_id">): Offer {
  return { title: "นาย", first_name: "สมชาย", last_name: "ใจดี", phone: "", offer_date: "2026-10-20",
    sourcing_channel: "JobThai", tat_at_offer: 0, ta_email: "mind@example.com", created_by: "", created_at: "", planned_start_date: null, ...p };
}

export const positions: Position[] = [
  { position_code: "SALES", position_name: "Sales", position_group: "Store", sla_days: null },
  { position_code: "SM", position_name: "Store Manager", position_group: "Store", sla_days: null },
];

export const noLog: StatusLogEntry[] = [];
