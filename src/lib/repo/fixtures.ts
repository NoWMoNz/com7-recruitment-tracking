import type { Branch, Offer, Position, Requisition, Status, StatusLogEntry, User } from "@/lib/domain/types";
import type { Dataset } from "./types";

/** Demo/test dataset. "Today" for these dates is 17/11/2026. */

const branches: Branch[] = [
  { branch_code: "BKK-012", branch_name: "เซ็นทรัลลาดพร้าว", brand: "Studio7", province: "กรุงเทพฯ", region: "ภาคกลาง", status: "Open", open_date: null, close_date: null },
  { branch_code: "BKK-045", branch_name: "สยามพารากอน", brand: "BaNANA", province: "กรุงเทพฯ", region: "ภาคกลาง", status: "Open", open_date: null, close_date: null },
  { branch_code: "NBI-003", branch_name: "เซ็นทรัลเวสต์เกต", brand: "Studio7", province: "นนทบุรี", region: "ภาคกลาง", status: "Open", open_date: null, close_date: null },
  { branch_code: "CNX-001", branch_name: "เซ็นทรัลเฟสติวัล เชียงใหม่", brand: "Studio7", province: "เชียงใหม่", region: "ภาคเหนือ", status: "Open", open_date: null, close_date: null },
  { branch_code: "CRI-002", branch_name: "เซ็นทรัลเชียงราย", brand: "BaNANA", province: "เชียงราย", region: "ภาคเหนือ", status: "Project", open_date: "2026-12-01", close_date: null },
  { branch_code: "HKT-004", branch_name: "เซ็นทรัลภูเก็ต", brand: "Studio7", province: "ภูเก็ต", region: "ภาคใต้", status: "Open", open_date: null, close_date: null },
];

const positions: Position[] = [
  { position_code: "SALES", position_name: "Sales", position_group: "Store", sla_days: null },
  { position_code: "ASM", position_name: "Assistant Store Manager", position_group: "Store", sla_days: 45 },
  { position_code: "SM", position_name: "Store Manager", position_group: "Store", sla_days: 60 },
  { position_code: "TECH", position_name: "Technician", position_group: "Service", sla_days: null },
];

const users: User[] = [
  { email: "ju@example.com", name: "จู", role: "super_admin", scope: "", active: true },
  { email: "mind@example.com", name: "มายด์", role: "ta", scope: "", active: true },
  { email: "ploy@example.com", name: "พลอย", role: "ta", scope: "", active: true },
  { email: "boss@example.com", name: "บอส", role: "viewer", scope: "", active: true },
  { email: "north@example.com", name: "หัวหน้าภาคเหนือ", role: "viewer", scope: "ภาคเหนือ", active: true },
];

// [branch, position, request_date, status, ta]
const rows: [string, string, string, Status, string][] = [
  ["BKK-012", "SALES", "2026-10-02", "Vacancy", "mind"],
  ["BKK-012", "SALES", "2026-10-28", "Offer", "mind"],
  ["BKK-012", "SM", "2026-08-01", "PendingCancel", "mind"],
  ["BKK-012", "TECH", "2026-11-10", "Vacancy", "mind"],
  ["BKK-045", "SALES", "2026-09-01", "Vacancy", "mind"],
  ["BKK-045", "ASM", "2026-10-15", "Vacancy", "mind"],
  ["BKK-045", "SALES", "2026-11-20", "Vacancy", "mind"],
  ["BKK-045", "SALES", "2026-09-20", "Hired", "mind"],
  ["NBI-003", "SALES", "2026-11-01", "Offer", "ploy"],
  ["NBI-003", "SALES", "2026-07-15", "Vacancy", "ploy"],
  ["NBI-003", "TECH", "2026-10-20", "PendingHold", "ploy"],
  ["NBI-003", "ASM", "2026-06-01", "Hold", "ploy"],
  ["CNX-001", "SALES", "2026-10-05", "Vacancy", "ploy"],
  ["CNX-001", "SALES", "2026-10-05", "Vacancy", "ploy"],
  ["CNX-001", "SM", "2026-09-10", "Offer", "ploy"],
  ["CNX-001", "TECH", "2026-08-20", "Cancel", "ploy"],
  ["CRI-002", "SALES", "2026-11-15", "Vacancy", "ploy"],
  ["CRI-002", "SALES", "2026-11-15", "Vacancy", "ploy"],
  ["CRI-002", "ASM", "2026-11-15", "Vacancy", "ploy"],
  ["CRI-002", "SM", "2026-11-15", "Vacancy", "ploy"],
  ["HKT-004", "SALES", "2026-09-25", "Vacancy", "mind"],
  ["HKT-004", "SALES", "2026-08-05", "Vacancy", "mind"],
  ["HKT-004", "TECH", "2026-10-30", "Offer", "mind"],
  ["HKT-004", "ASM", "2026-09-01", "Vacancy", ""],
  ["HKT-004", "SALES", "2026-10-01", "Hired", "mind"],
];

const offerDates: Record<number, string> = { 2: "2026-11-14", 9: "2026-11-12", 15: "2026-11-05", 23: "2026-11-16" };
const offerNames: Record<number, [string, string, string]> = {
  2: ["นาย", "สมชาย", "ใจดี"],
  9: ["นางสาว", "สุดา", "แก้วใส"],
  15: ["นาย", "ณัฐพล", "ศรีสุข"],
  23: ["นาง", "วรรณา", "ทองดี"],
};

const pad = (n: number) => String(n).padStart(4, "0");

const requisitions: Requisition[] = rows.map(([branch_code, position_code, request_date, status, ta], i) => {
  const n = i + 1;
  return {
    id: `REQ-${pad(n)}`,
    branch_code,
    position_code,
    request_date,
    source: n % 3 === 0 ? "Resign" : branch_code === "CRI-002" ? "NewStore" : "Additional",
    source_ref: "",
    ta_email: ta ? `${ta}@example.com` : "",
    status,
    status_date: null,
    offer_id: offerDates[n] ? `OFF-${pad(n)}` : "",
    closed_at: status === "Hired" || status === "Cancel" ? "2026-11-01" : null,
    version: 1,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
});

const offers: Offer[] = Object.entries(offerDates).map(([n, offer_date]) => {
  const [title, first_name, last_name] = offerNames[Number(n)];
  const req = requisitions[Number(n) - 1];
  return {
    id: `OFF-${pad(Number(n))}`,
    req_id: req.id,
    title,
    first_name,
    last_name,
    phone: "",
    offer_date,
    sourcing_channel: "JobThai",
    tat_at_offer: 0,
    ta_email: req.ta_email,
    created_by: req.ta_email,
    created_at: `${offer_date}T03:00:00.000Z`,
  };
});

const log = (n: number, req: number, from: string, to: string, date: string): StatusLogEntry => ({
  id: `LOG-${pad(n)}`,
  req_id: `REQ-${pad(req)}`,
  from_status: from,
  to_status: to,
  effective_date: date,
  actor: "ju@example.com",
  at: `${date}T03:00:00.000Z`,
  note: "",
  ref_id: "",
});

const statusLog: StatusLogEntry[] = [
  // REQ-0005 was on hold 01/10 – 15/10 (14 days) then resumed
  log(1, 5, "Vacancy", "PendingHold", "2026-09-30"),
  log(2, 5, "PendingHold", "Hold", "2026-10-01"),
  log(3, 5, "Hold", "Vacancy", "2026-10-15"),
  // REQ-0012 is on hold since 01/09
  log(4, 12, "Vacancy", "PendingHold", "2026-08-30"),
  log(5, 12, "PendingHold", "Hold", "2026-09-01"),
];

export const fixtures: Dataset = {
  Branches: branches,
  Positions: positions,
  Users: users,
  Settings: [
    { key: "default_sla_days", value: "30" },
    { key: "aging_bands", value: "30,60,90" },
    { key: "backdate_days", value: "3" },
  ],
  SourcingChannels: ["JobThai", "JobsDB", "LinkedIn", "Facebook", "Walk-in", "Referral"].map((channel) => ({
    channel,
    active: true,
  })),
  RecruiterAssignments: [
    { branch_code: "BKK-012", position_group: "", ta_email: "mind@example.com" },
    { branch_code: "NBI-003", position_group: "", ta_email: "ploy@example.com" },
  ],
  Requisitions: requisitions,
  Offers: offers,
  StatusLog: statusLog,
};
