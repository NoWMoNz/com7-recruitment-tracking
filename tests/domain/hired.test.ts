import { describe, expect, test } from "vitest";
import { buildHiredRows, filterHiredRows } from "@/lib/domain/hired";
import type { NewHire } from "@/lib/domain/types";
import { branch, offer, positions, req, user } from "./helpers";

const ju = user({ email: "ju@example.com", role: "super_admin" });
const north = user({ email: "north@example.com", role: "viewer", scope: "ภาคเหนือ" });
const mind = user({ email: "mind@example.com", name: "มายด์" });
const hire = (p: Partial<NewHire> & Pick<NewHire, "id" | "req_id">): NewHire => ({
  ...offer(p), employee_id: "E1", start_date: "2026-11-20", hired_at: "2026-11-18", tat: 20, tat_result: "Meet", ...p,
});
const data = {
  newHires: [
    hire({ id: "H1", req_id: "R1", employee_id: "E1", first_name: "สมชาย", start_date: "2026-11-20", tat_result: "Meet" }),
    hire({ id: "H2", req_id: "R2", employee_id: "E2", first_name: "สุดา", title: "นางสาว", start_date: "2026-12-01", tat_result: "NotMeet" }),
    hire({ id: "H3", req_id: "R3", employee_id: "E3", start_date: null }),
  ],
  requisitions: [
    req({ id: "R1", branch_code: "BKK-012", status: "Hired" }),
    req({ id: "R2", branch_code: "CNX-001", status: "Hired", position_code: "SM", ta_email: "ploy@example.com" }),
    req({ id: "R3", branch_code: "BKK-012", status: "Hired" }),
  ],
  branches: [
    branch({ branch_code: "BKK-012", branch_name: "ลาดพร้าว", region: "ภาคกลาง", am: "ก", rm: "R" }),
    branch({ branch_code: "CNX-001", branch_name: "เฟสติวัล", region: "ภาคเหนือ", bu: "BaNANA" }),
  ],
  positions,
  users: [ju, mind],
};

describe("buildHiredRows", () => {
  const rows = buildHiredRows(data, ju);
  test("one row per hire with employee ID, start date and where they went; latest start first, unknown start last", () => {
    expect(rows.map((r) => r.id)).toEqual(["H2", "H1", "H3"]);
    expect(rows[1]).toMatchObject({
      employeeId: "E1", name: "นายสมชาย ใจดี", startDate: "2026-11-20", branchCode: "BKK-012", branchName: "IDBKK-012 : ลาดพร้าว",
      positionName: "Sales", taName: "มายด์", am: "ก", rm: "R", ta: "mind@example.com", tatResult: "Meet",
    });
  });
  test("leaves out branches outside the viewer's scope", () => {
    expect(buildHiredRows(data, north).map((r) => r.id)).toEqual(["H2"]);
  });
});

describe("filterHiredRows", () => {
  const rows = buildHiredRows(data, ju);
  test("by start date range (a hire without a start date never matches a range), region, AM and search", () => {
    expect(filterHiredRows(rows, { from: "2026-11-25", to: "2026-12-31" }).map((r) => r.id)).toEqual(["H2"]);
    expect(filterHiredRows(rows, { region: "ภาคกลาง" }).map((r) => r.id)).toEqual(["H1", "H3"]);
    expect(filterHiredRows(rows, { am: "ก" }).map((r) => r.id)).toEqual(["H1", "H3"]);
    expect(filterHiredRows(rows, { q: "e2" }).map((r) => r.id)).toEqual(["H2"]);
  });
});
