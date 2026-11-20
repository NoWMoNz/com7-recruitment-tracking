import type { Approval, Branch, Offer, Position, Requisition, Status, StatusLogEntry, User } from "@/lib/domain/types";
import type { Dataset } from "./types";

/** Demo/test dataset. "Today" for these dates is 17/11/2026. */

const branches: Branch[] = [
  { branch_code: "BKK-012", branch_name: "เซ็นทรัลลาดพร้าว", brand: "Studio7", bu: "Apple", province: "กรุงเทพฯ", region: "ภาคกลาง", status: "Open", open_date: null, close_date: null },
  { branch_code: "BKK-045", branch_name: "สยามพารากอน", brand: "BaNANA", bu: "BaNANA", province: "กรุงเทพฯ", region: "ภาคกลาง", status: "Open", open_date: null, close_date: null },
  { branch_code: "NBI-003", branch_name: "เซ็นทรัลเวสต์เกต", brand: "Studio7", bu: "Apple", province: "นนทบุรี", region: "ภาคกลาง", status: "Open", open_date: null, close_date: null },
  { branch_code: "CNX-001", branch_name: "เซ็นทรัลเฟสติวัล เชียงใหม่", brand: "Studio7", bu: "Apple", province: "เชียงใหม่", region: "ภาคเหนือ", status: "Open", open_date: null, close_date: null },
  { branch_code: "CRI-002", branch_name: "เซ็นทรัลเชียงราย", brand: "BaNANA", bu: "BaNANA", province: "เชียงราย", region: "ภาคเหนือ", status: "Project", open_date: "2026-12-01", close_date: null },
  { branch_code: "HKT-004", branch_name: "เซ็นทรัลภูเก็ต", brand: "Studio7", bu: "Apple", province: "ภูเก็ต", region: "ภาคใต้", status: "Open", open_date: null, close_date: null },
  // Closing on 15/11: the processor cancels its open requisitions and flags the pending Offer for review.
  { branch_code: "KKN-007", branch_name: "เซ็นทรัลขอนแก่น", brand: "Studio7", bu: "Apple", province: "ขอนแก่น", region: "ภาคอีสาน", status: "Closed", open_date: null, close_date: "2026-11-15" },
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
  ["KKN-007", "SALES", "2026-10-10", "Vacancy", "ploy"],
  ["KKN-007", "SM", "2026-09-15", "Offer", "ploy"],
];

const offerDates: Record<number, string> = { 2: "2026-11-14", 9: "2026-11-12", 15: "2026-11-05", 23: "2026-11-16", 27: "2026-11-01" };
const offerNames: Record<number, [string, string, string]> = {
  2: ["นาย", "สมชาย", "ใจดี"],
  9: ["นางสาว", "สุดา", "แก้วใส"],
  15: ["นาย", "ณัฐพล", "ศรีสุข"],
  23: ["นาง", "วรรณา", "ทองดี"],
  27: ["นาย", "ปกรณ์", "มั่นคง"],
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
  // The two pending rows were requested through the web, so each has a request awaiting approval.
  log(6, 3, "Vacancy", "PendingCancel", "2026-11-15"),
  log(7, 11, "Vacancy", "PendingHold", "2026-11-16"),
];

/** Pending requests for REQ-0003 / REQ-0011, with built-in placeholder photos ("local:demo-*"). */
const approvals: Approval[] = [
  {
    id: "APR-0001", req_id: "REQ-0003", type: "Cancel", reason: "สาขาปรับโครงสร้าง ไม่ต้องการ Store Manager เพิ่ม",
    effective_date: "2026-11-15", evidence_url: "local:demo-memo", requested_by: "mind@example.com",
    requested_at: "2026-11-15T04:10:00.000Z", status: "Pending", decided_by: "", decided_at: "", decision_note: "",
  },
  {
    id: "APR-0002", req_id: "REQ-0011", type: "Hold", reason: "ร้านปิดปรับปรุง 1 เดือน",
    effective_date: "2026-11-16", evidence_url: "local:demo-notice", requested_by: "ploy@example.com",
    requested_at: "2026-11-16T07:30:00.000Z", status: "Pending", decided_by: "", decided_at: "", decision_note: "",
  },
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
  Approvals: approvals,
  // Sample rows pasted by Ju, waiting for "ประมวลผลข้อมูล" (dates relative to 17–18/11/2026).
  // HR's headcount as of 11/11/2026 for the demo branches: short, over, full and an empty store.
  Quota: [
    { branch_code: "BKK-012", position_code: "SALES", quota: 6, actual: 4, report_date: "2026-11-11" },
    { branch_code: "BKK-012", position_code: "SM", quota: 1, actual: 1, report_date: "2026-11-11" },
    { branch_code: "BKK-012", position_code: "ASM", quota: 1, actual: 2, report_date: "2026-11-11" },
    { branch_code: "BKK-045", position_code: "SALES", quota: 5, actual: 5, report_date: "2026-11-11" },
    { branch_code: "BKK-045", position_code: "ASM", quota: 1, actual: 1, report_date: "2026-11-11" },
    { branch_code: "NBI-003", position_code: "SALES", quota: 4, actual: 5, report_date: "2026-11-11" },
    { branch_code: "NBI-003", position_code: "SM", quota: 1, actual: 0, report_date: "2026-11-11" },
    { branch_code: "CNX-001", position_code: "SALES", quota: 5, actual: 3, report_date: "2026-11-11" },
    { branch_code: "CNX-001", position_code: "TECH", quota: 2, actual: 2, report_date: "2026-11-11" },
    { branch_code: "CRI-002", position_code: "SALES", quota: 4, actual: 0, report_date: "2026-11-11" },
    { branch_code: "HKT-004", position_code: "SALES", quota: 4, actual: 4, report_date: "2026-11-11" },
    { branch_code: "KKN-007", position_code: "SALES", quota: 4, actual: 2, report_date: "2026-11-11" },
  ],
  Import_Resign: [
    { employee_id: "E1001", title: "นาย", first_name: "วิชัย", last_name: "ทองมา", branch_code: "BKK-045", position_code: "SALES", effective_date: "2026-11-10", processed_at: "", cancelled_at: "", cancelled_by: "", cancel_note: "" },
    { employee_id: "E1002", title: "นางสาว", first_name: "อรุณี", last_name: "แสงทอง", branch_code: "HKT-004", position_code: "TECH", effective_date: "2026-12-01", processed_at: "", cancelled_at: "", cancelled_by: "", cancel_note: "" },
    { employee_id: "E1003", title: "นาย", first_name: "ทดสอบ", last_name: "รหัสผิด", branch_code: "XXX-999", position_code: "SALES", effective_date: "2026-11-12", processed_at: "", cancelled_at: "", cancelled_by: "", cancel_note: "" },
  ],
  Import_Transfer: [
    { employee_id: "E2001", title: "นาย", first_name: "ธนา", last_name: "ใจกว้าง", from_branch: "BKK-012", from_position: "SALES", to_branch: "CNX-001", to_position: "SALES", effective_date: "2026-11-15", processed_at: "" },
    { employee_id: "E2002", title: "นางสาว", first_name: "พิมพ์", last_name: "ดาวเรือง", from_branch: "HKT-004", from_position: "SALES", to_branch: "NBI-003", to_position: "SM", effective_date: "2026-11-16", processed_at: "" },
    { employee_id: "E2003", title: "นาย", first_name: "กิตติ", last_name: "รุ่งเรือง", from_branch: "BKK-045", from_position: "ASM", to_branch: "BKK-012", to_position: "SALES", effective_date: "2026-12-05", processed_at: "" },
  ],
  Import_NewEmployee: [
    { employee_id: "E3001", title: "นาย", first_name: "สมชาย", last_name: "ใจดี", branch_code: "BKK-012", position_code: "SALES", start_date: "2026-11-20", processed_at: "", matched_req_id: "" },
    { employee_id: "E3002", title: "นางสาว", first_name: "สุดา", last_name: "แก้วใส่", branch_code: "NBI-003", position_code: "SALES", start_date: "2026-11-21", processed_at: "", matched_req_id: "" },
  ],
  Import_Requisition: [{ branch_code: "CRI-002", position_code: "TECH", headcount: 2, request_date: "2026-11-15", source: "NewStore", note: "ร้านใหม่", processed_at: "" }],
};
