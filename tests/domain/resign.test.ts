import { describe, expect, test } from "vitest";
import { buildResignRows, filterResignRows, planNewResignation, planWithdrawal, resignRef } from "@/lib/domain/resign";
import type { Branch, ImportResign, Offer, Requisition, Status, StatusLogEntry } from "@/lib/domain/types";
import { branch, offer, positions, req, user } from "./helpers";

const TODAY = "2026-11-20";
const ju = user({ email: "ju@example.com", role: "super_admin" });
const mind = user({ email: "mind@example.com", name: "มายด์", role: "ta" });
const north = user({ email: "north@example.com", role: "ta", scope: "ภาคเหนือ" });
const viewer = user({ email: "view@example.com", role: "viewer" });

const bkk = branch({ branch_code: "BKK-012", branch_name: "ลาดพร้าว", bu: "Apple", region: "ภาคกลาง" });
const cnx = branch({ branch_code: "CNX-001", branch_name: "เชียงใหม่", bu: "BaNANA", region: "ภาคเหนือ" });
const branches: Branch[] = [bkk, cnx];

const resign = (p: Partial<ImportResign> = {}): ImportResign => ({
  employee_id: "E100", title: "นาย", first_name: "ก", last_name: "ข", branch_code: "BKK-012", position_code: "SALES",
  effective_date: "2026-11-20", processed_at: "2026-11-17T17:30:00Z", cancelled_at: "", cancelled_by: "", cancel_note: "", ...p,
});
const linked = (row: ImportResign, p: Partial<Requisition> = {}) => req({ id: `R-${row.employee_id}-${row.effective_date}`, source_ref: resignRef(row), ...p });

const data = (rows: ImportResign[], requisitions: Requisition[] = []) => ({
  resign: rows.map((row, i) => ({ rowNumber: i + 2, row })),
  requisitions,
  branches,
  positions,
  users: [ju, mind],
});

describe("resignRef", () => {
  test("matches the ref the processor writes", () => {
    expect(resignRef({ employee_id: " E100 ", effective_date: "2026-11-20" })).toBe("RESIGN:E100:2026-11-20");
  });
});

describe("buildResignRows", () => {
  test("lists only processed rows the viewer may see, newest effective date first", () => {
    const a = resign({ employee_id: "E1", effective_date: "2026-11-01" });
    const b = resign({ employee_id: "E2", effective_date: "2026-11-15" });
    const notProcessed = resign({ employee_id: "E3", processed_at: "" });
    const northRow = resign({ employee_id: "E4", branch_code: "CNX-001", effective_date: "2026-11-10" });
    const d = data([a, b, notProcessed, northRow]);
    expect(buildResignRows(d, ju, TODAY).map((r) => r.employeeId)).toEqual(["E2", "E4", "E1"]);
    expect(buildResignRows(d, north, TODAY).map((r) => r.employeeId)).toEqual(["E4"]);
  });

  test("carries name, BU, place and row number", () => {
    const [r] = buildResignRows(data([resign({ title: "นางสาว", first_name: "อรุณี", last_name: "แสงทอง" })]), ju, TODAY);
    expect(r).toMatchObject({ rowNumber: 2, employeeId: "E100", name: "นางสาวอรุณี แสงทอง", bu: "Apple", region: "ภาคกลาง", branchName: "IDBKK-012 : ลาดพร้าว", positionName: "Sales" });
  });

  test("state: future date is upcoming, today or past is resigned, withdrawn wins over both", () => {
    const future = resign({ employee_id: "F", effective_date: "2026-11-21" });
    const today = resign({ employee_id: "T", effective_date: "2026-11-20" });
    const gone = resign({ employee_id: "W", effective_date: "2026-12-01", cancelled_at: "2026-11-18T01:00:00Z", cancelled_by: "mind@example.com", cancel_note: "อยู่ต่อ" });
    const byId = Object.fromEntries(buildResignRows(data([future, today, gone]), ju, TODAY).map((r) => [r.employeeId, r]));
    expect(byId.F.state).toBe("upcoming");
    expect(byId.T.state).toBe("resigned");
    expect(byId.W).toMatchObject({ state: "withdrawn", cancelledBy: "มายด์", cancelNote: "อยู่ต่อ" });
  });

  test("the same employee resigning twice keeps two rows, each linked to its own requisition", () => {
    const first = resign({ effective_date: "2026-10-01" });
    const second = resign({ effective_date: "2026-11-20" });
    const rows = buildResignRows(data([first, second], [linked(first, { status: "Hired" }), linked(second, { status: "Vacancy" })]), ju, TODAY);
    expect(rows.map((r) => [r.effectiveDate, r.reqId, r.reqStatus])).toEqual([
      ["2026-11-20", "R-E100-2026-11-20", "Vacancy"],
      ["2026-10-01", "R-E100-2026-10-01", "Hired"],
    ]);
  });

  test("a hand-typed cancelled_at does not crash the list; it is shown as typed", () => {
    const typed = resign({ cancelled_at: "ยกเลิก", cancelled_by: "mind@example.com" });
    const [r] = buildResignRows(data([typed]), ju, TODAY);
    expect(r).toMatchObject({ state: "withdrawn", cancelledDay: "ยกเลิก" });
    const [good] = buildResignRows(data([resign({ cancelled_at: "2026-11-18T01:00:00.000Z" })]), ju, TODAY);
    expect(good.cancelledDay).toBe("18/11/2026");
  });

  test("a row whose requisition is missing has no link", () => {
    const [r] = buildResignRows(data([resign()]), ju, TODAY);
    expect(r).toMatchObject({ reqId: null, reqStatus: null });
  });

  test("canWithdraw: TA in scope and admin yes; viewer, out-of-scope TA and withdrawn rows no", () => {
    const open = resign({ employee_id: "A" });
    const done = resign({ employee_id: "B", cancelled_at: "2026-11-18T01:00:00Z" });
    const nth = resign({ employee_id: "C", branch_code: "CNX-001" });
    const d = data([open, done, nth]);
    const can = (v: typeof ju) => Object.fromEntries(buildResignRows(d, v, TODAY).map((r) => [r.employeeId, r.canWithdraw]));
    expect(can(ju)).toEqual({ A: true, B: false, C: true });
    expect(can(mind)).toEqual({ A: true, B: false, C: true });
    expect(can(north)).toEqual({ C: true });
    expect(can(viewer)).toEqual({ A: false, B: false, C: false });
  });
});

describe("filterResignRows", () => {
  const rows = buildResignRows(
    data([
      resign({ employee_id: "E1", first_name: "สมชาย", effective_date: "2026-11-01" }),
      resign({ employee_id: "E2", first_name: "สุดา", branch_code: "CNX-001", effective_date: "2026-11-15" }),
      resign({ employee_id: "E3", effective_date: "2026-12-05", cancelled_at: "2026-11-18T01:00:00Z" }),
    ]),
    ju,
    TODAY,
  );
  const ids = (f: Parameters<typeof filterResignRows>[1]) => filterResignRows(rows, f).map((r) => r.employeeId).sort();

  test("by BU, region and state", () => {
    expect(ids({ bu: "BaNANA" })).toEqual(["E2"]);
    expect(ids({ region: "ภาคกลาง" })).toEqual(["E1", "E3"]);
    expect(ids({ state: "withdrawn" })).toEqual(["E3"]);
  });
  test("by effective date, both ends inclusive", () => {
    expect(ids({ from: "2026-11-15", to: "2026-12-05" })).toEqual(["E2", "E3"]);
    expect(ids({ to: "2026-11-01" })).toEqual(["E1"]);
  });
  test("search matches name, employee id, branch or position, ignoring case", () => {
    expect(ids({ q: "สุดา" })).toEqual(["E2"]);
    expect(ids({ q: "e1" })).toEqual(["E1"]);
    expect(ids({ q: "เชียงใหม่" })).toEqual(["E2"]);
    expect(ids({ q: "SALES" })).toEqual(["E1", "E2", "E3"]);
  });
  test("no filter keeps everything", () => {
    expect(ids({})).toEqual(["E1", "E2", "E3"]);
  });
});

describe("planWithdrawal", () => {
  const NOW = new Date("2026-11-20T03:00:00Z");
  const ids = { logId: "LOG-1", reviewId: "REV-1" };
  const REF = "RESIGN:E100:2026-11-20";
  const plan = (p: { row?: ImportResign; req?: Requisition | null; offer?: Offer | null; viewer?: typeof ju; note?: string; branch?: Branch; reviewRefs?: Set<string>; log?: StatusLogEntry[] } = {}) =>
    planWithdrawal({
      row: p.row ?? resign(),
      branch: p.branch ?? bkk,
      req: p.req === undefined ? linked(resign()) : p.req,
      offer: p.offer ?? null,
      reviewRefs: p.reviewRefs ?? new Set(),
      log: p.log ?? [],
      viewer: p.viewer ?? mind,
      note: p.note ?? "พนักงานขออยู่ต่อ",
      today: TODAY,
      ids,
      now: NOW,
    });
  const ok = (r: ReturnType<typeof plan>) => {
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.value;
  };

  test("a Vacancy is closed as Cancel at once, with a log row and the withdrawal on the import row", () => {
    const v = ok(plan());
    expect(v.outcome).toBe("cancelled");
    expect(v.reqPatch).toEqual({ status: "Cancel", status_date: TODAY, closed_at: TODAY });
    expect(v.logEntry).toMatchObject({ id: "LOG-1", from_status: "Vacancy", to_status: "Cancel", effective_date: TODAY, actor: "mind@example.com", ref_id: REF });
    expect(v.logEntry!.note).toMatch(/^ยกเลิกลาออก:/);
    expect(v.review).toBeNull();
    expect(v.importPatch).toEqual({ cancelled_at: NOW.toISOString(), cancelled_by: "mind@example.com", cancel_note: "พนักงานขออยู่ต่อ" });
  });

  test("a Vacancy not yet effective is closed on its request date, not today", () => {
    const future = resign({ effective_date: "2026-12-01" });
    const v = ok(plan({ row: future, req: linked(future, { request_date: "2026-12-01" }) }));
    expect(v.reqPatch).toEqual({ status: "Cancel", status_date: "2026-12-01", closed_at: "2026-12-01" });
    expect(v.logEntry).toMatchObject({ effective_date: "2026-12-01" });
  });

  test("an Offer is left alone and sent to review with the offered person's name", () => {
    const o = offer({ id: "O1", req_id: "R-E100-2026-11-20", first_name: "สมหญิง", last_name: "ใจงาม" });
    const v = ok(plan({ req: linked(resign(), { status: "Offer", offer_id: "O1" }), offer: o }));
    expect(v.outcome).toBe("review");
    expect(v.reqPatch).toBeNull();
    expect(v.logEntry).toBeNull();
    expect(v.review).toMatchObject({ id: "REV-1", type: "ResignWithdrawn", ref: `RESIGNWD:${REF}`, resolved_by: "", resolved_at: "" });
    expect(v.review!.detail).toContain("สมหญิง");
    expect(v.importPatch.cancelled_by).toBe("mind@example.com");
  });

  test.each<Status>(["Hold", "PendingCancel", "PendingHold"])("a %s requisition is left alone and sent to review", (status) => {
    const v = ok(plan({ req: linked(resign(), { status }) }));
    expect(v).toMatchObject({ outcome: "review", reqPatch: null, logEntry: null });
    expect(v.review?.type).toBe("ResignWithdrawn");
  });

  test("a review item already on the queue is not added twice", () => {
    const v = ok(plan({ req: linked(resign(), { status: "Hold" }), reviewRefs: new Set([`RESIGNWD:${REF}`]) }));
    expect(v.outcome).toBe("review");
    expect(v.review).toBeNull();
  });

  test.each<Status>(["Hired", "Transfer"])("a closed (%s) requisition is not touched, only the withdrawal is recorded", (status) => {
    const v = ok(plan({ req: linked(resign(), { status }) }));
    expect(v).toMatchObject({ outcome: "recorded", reqPatch: null, logEntry: null, review: null });
    expect(v.importPatch.cancelled_at).toBe(NOW.toISOString());
  });

  const cancelLog = (p: Partial<StatusLogEntry> = {}): StatusLogEntry => ({
    id: "L1", req_id: "R-E100-2026-11-20", from_status: "Vacancy", to_status: "Cancel", effective_date: TODAY, actor: "x", at: "", note: "", ref_id: "APR-1", ...p,
  });

  test("a requisition already Cancel with its Cancel log row in place: only the withdrawal is recorded", () => {
    const v = ok(plan({ req: linked(resign(), { status: "Cancel", closed_at: TODAY }), log: [cancelLog()] }));
    expect(v).toMatchObject({ outcome: "recorded", reqPatch: null, logEntry: null });
  });

  test("a requisition already Cancel but with no Cancel log row (a retry after the log write failed) gets the missing row, once", () => {
    const v = ok(plan({ req: linked(resign(), { status: "Cancel", status_date: "2026-11-19", closed_at: "2026-11-19" }), log: [cancelLog({ req_id: "OTHER" })] }));
    expect(v.outcome).toBe("cancelled");
    expect(v.reqPatch).toBeNull();
    expect(v.logEntry).toMatchObject({ req_id: "R-E100-2026-11-20", from_status: "Vacancy", to_status: "Cancel", effective_date: "2026-11-19", ref_id: REF });
  });

  test("no linked requisition: only the withdrawal is recorded", () => {
    expect(ok(plan({ req: null })).outcome).toBe("recorded");
  });

  test("refuses: viewer, TA out of scope, already withdrawn, blank reason, unprocessed row", () => {
    expect(plan({ viewer })).toMatchObject({ ok: false, errors: { form: expect.any(String) } });
    expect(plan({ viewer: north })).toMatchObject({ ok: false, errors: { form: expect.any(String) } });
    expect(plan({ row: resign({ cancelled_at: "2026-11-18T01:00:00Z" }) })).toMatchObject({ ok: false, errors: { form: "รายการนี้ยกเลิกลาออกไปแล้ว" } });
    expect(plan({ note: "   " })).toMatchObject({ ok: false, errors: { note: expect.any(String) } });
    expect(plan({ row: resign({ processed_at: "" }) })).toMatchObject({ ok: false, errors: { form: expect.any(String) } });
  });

  test("a reason longer than 500 characters is refused (it goes into the log and the sheet cell)", () => {
    expect(plan({ note: "ก".repeat(501) })).toMatchObject({ ok: false, errors: { note: expect.stringContaining("500") } });
    expect(plan({ note: "ก".repeat(500) }).ok).toBe(true);
  });

  test("the review item names the requisition, branch and position, so the admin can find it", () => {
    const v = ok(plan({ req: linked(resign(), { status: "Hold" }) }));
    expect(v.review!.detail).toContain("R-E100-2026-11-20");
    expect(v.review!.detail).toContain("BKK-012");
    expect(v.review!.detail).toContain("SALES");
  });

  test("an admin may withdraw in any region", () => {
    expect(plan({ viewer: ju, branch: cnx }).ok).toBe(true);
  });
});

describe("planNewResignation", () => {
  const input = { employeeId: " E900 ", title: "นาย", firstName: "ก", lastName: "ข", branchCode: "BKK-012", positionCode: "SALES", effectiveDate: "2026-12-01" };
  const plan = (over: Partial<typeof input> = {}, existing: ImportResign[] = [], who = mind) => planNewResignation({ input: { ...input, ...over }, existing, branches, positions, viewer: who });

  test("makes an unprocessed Import_Resign row with the date and ids cleaned up", () => {
    const res = plan();
    expect(res.ok && res.value.row).toEqual({
      employee_id: "E900", title: "นาย", first_name: "ก", last_name: "ข", branch_code: "BKK-012", position_code: "SALES",
      effective_date: "2026-12-01", processed_at: "", cancelled_at: "", cancelled_by: "", cancel_note: "",
    });
  });

  test("accepts a date typed as dd/mm/yyyy", () => {
    const res = plan({ effectiveDate: "01/12/2026" });
    expect(res.ok && res.value.row.effective_date).toBe("2026-12-01");
  });

  test("asks for every missing piece", () => {
    const res = plan({ employeeId: "", firstName: "", lastName: " ", title: "x", branchCode: "", positionCode: "", effectiveDate: "" });
    expect(!res.ok && Object.keys(res.errors).sort()).toEqual(["branchCode", "effectiveDate", "employeeId", "firstName", "lastName", "positionCode", "title"]);
  });

  test("refuses a closed branch, an unknown branch and a branch outside the viewer scope", () => {
    const closed = branch({ branch_code: "OLD", status: "Closed" });
    const r1 = planNewResignation({ input: { ...input, branchCode: "OLD" }, existing: [], branches: [...branches, closed], positions, viewer: ju });
    expect(!r1.ok && r1.errors.branchCode).toBe("สาขานี้ปิดแล้ว");
    expect(plan({ branchCode: "NOPE" }).ok).toBe(false);
    const r3 = plan({}, [], north);
    expect(!r3.ok && r3.errors.branchCode).toBe("สาขานี้อยู่นอกขอบเขตของคุณ");
  });

  test("refuses the same person and effective date twice, but allows another date", () => {
    const existing = [resign({ employee_id: "E900", effective_date: "2026-12-01" })];
    const dup = plan({}, existing);
    expect(!dup.ok && dup.errors.employeeId).toContain("E900");
    expect(plan({ effectiveDate: "2026-12-15" }, existing).ok).toBe(true);
  });

  test("a viewer cannot add", () => {
    const res = plan({}, [], viewer);
    expect(!res.ok && res.errors.form).toBe("คุณไม่มีสิทธิ์เพิ่มรายชื่อลาออก");
  });
});
