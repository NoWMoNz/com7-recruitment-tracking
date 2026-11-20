import { describe, expect, test } from "vitest";
import { assignTa, personKey, planProcessing, type ProcessorInput, type ProcessorPlan } from "@/lib/domain/processor";
import { parseSettings } from "@/lib/domain/settings";
import type { Approval, ImportNewEmployee, ImportResign, ImportTransfer } from "@/lib/domain/types";
import { branch, offer, positions, req } from "./helpers";

const today = "2026-11-17";

function input(over: Partial<ProcessorInput> = {}, imports: Partial<ProcessorInput["imports"]> = {}): ProcessorInput {
  let n = 0;
  return {
    today,
    now: new Date("2026-11-17T17:30:00.000Z"),
    actor: "system",
    settings: parseSettings([]),
    requisitions: [],
    offers: [],
    log: [],
    approvals: [],
    branches: [branch({ branch_code: "BKK-012" }), branch({ branch_code: "CNX-001", region: "ภาคเหนือ" })],
    positions,
    assignments: [
      { branch_code: "BKK-012", position_group: "", ta_email: "mind@example.com" },
      { branch_code: "BKK-012", position_group: "Store", ta_email: "store@example.com" },
    ],
    channels: ["JobThai"],
    newHires: [],
    reviewQueue: [],
    newId: (p) => `${p}-${++n}`,
    ...over,
    imports: { initial: [], requisition: [], resign: [], transfer: [], newEmployee: [], ...imports },
  };
}

/** Applies a plan the way the repo would, so the processor can be run again on the result. */
function applied(i: ProcessorInput, plan: ProcessorPlan): ProcessorInput {
  const reqs = i.requisitions.map((r) => {
    const u = plan.reqUpdate.find((x) => x.id === r.id);
    return u ? { ...r, ...u.patch, version: r.version + 1 } : r;
  });
  const markImports = <T extends { processed_at: string }>(rows: { rowNumber: number; row: T }[], tab: keyof ProcessorPlan["importMarks"]) =>
    rows.map((r) => {
      const m = plan.importMarks[tab].find((x) => x.rowNumber === r.rowNumber);
      return m ? { ...r, row: { ...r.row, ...m.patch } } : r;
    });
  return {
    ...i,
    requisitions: [...reqs, ...plan.reqAppend],
    offers: [...i.offers.filter((o) => !plan.offerRemove.includes(o.id)), ...plan.offerAppend],
    log: [...i.log, ...plan.logAppend],
    newHires: [...i.newHires, ...plan.newHireAppend],
    reviewQueue: [...i.reviewQueue, ...plan.reviewAppend],
    imports: {
      initial: markImports(i.imports.initial, "Import_Initial"),
      requisition: markImports(i.imports.requisition, "Import_Requisition"),
      resign: markImports(i.imports.resign, "Import_Resign"),
      transfer: markImports(i.imports.transfer, "Import_Transfer"),
      newEmployee: markImports(i.imports.newEmployee, "Import_NewEmployee"),
    },
  };
}

const nothingToDo = (p: ProcessorPlan) =>
  p.reqAppend.length + p.reqUpdate.length + p.offerAppend.length + p.offerRemove.length + p.newHireAppend.length + p.logAppend.length + p.reviewAppend.length;

const resign = (p: Partial<ImportResign> = {}): ImportResign => ({
  employee_id: "E100", title: "นาย", first_name: "ก", last_name: "ข", branch_code: "BKK-012", position_code: "SALES", effective_date: "2026-11-20", processed_at: "", ...p,
});
const transfer = (p: Partial<ImportTransfer> = {}): ImportTransfer => ({
  employee_id: "E200", title: "นาย", first_name: "โอน", last_name: "ย้าย", from_branch: "BKK-012", from_position: "SALES", to_branch: "CNX-001", to_position: "SALES",
  effective_date: "2026-11-15", processed_at: "", ...p,
});
const newEmp = (p: Partial<ImportNewEmployee> = {}): ImportNewEmployee => ({
  employee_id: "E300", title: "นาย", first_name: "สมชาย", last_name: "ใจดี", branch_code: "BKK-012", position_code: "SALES", start_date: "2026-11-20", processed_at: "", matched_req_id: "", ...p,
});

describe("helpers", () => {
  test("personKey ignores titles, spacing and case", () => {
    expect(personKey("นายสมชาย", "ใจดี ")).toBe(personKey(" สมชาย", "ใจดี"));
    expect(personKey("นางสาว สุดา", "แก้วใส")).toBe("สุดา แก้วใส");
    expect(personKey("Mr. John", "Smith")).toBe("john smith");
  });
  test("assignTa prefers branch + position group, then branch, else nobody", () => {
    const a = input().assignments;
    expect(assignTa("BKK-012", "Store", a)).toBe("store@example.com");
    expect(assignTa("BKK-012", "Service", a)).toBe("mind@example.com");
    expect(assignTa("CNX-001", "Store", a)).toBe("");
  });
});

describe("resignations", () => {
  test("create one requisition dated the effective date, assigned by RecruiterAssignments, and mark the row", () => {
    const i = input({}, { resign: [{ rowNumber: 2, row: resign() }] });
    const plan = planProcessing(i);
    expect(plan.reqAppend).toHaveLength(1);
    expect(plan.reqAppend[0]).toMatchObject({ request_date: "2026-11-20", status: "Vacancy", source: "Resign", source_ref: "RESIGN:E100:2026-11-20", ta_email: "store@example.com" });
    expect(plan.importMarks.Import_Resign).toEqual([{ rowNumber: 2, patch: { processed_at: "2026-11-17T17:30:00.000Z" } }]);
    expect(plan.summary.created).toBe(1);
  });

  test("re-running is a no-op, even if the processed mark was lost", () => {
    const i = input({}, { resign: [{ rowNumber: 2, row: resign() }] });
    const once = applied(i, planProcessing(i));
    expect(nothingToDo(planProcessing(once))).toBe(0);
    const lostMark = { ...once, imports: { ...once.imports, resign: i.imports.resign } };
    expect(planProcessing(lostMark).reqAppend).toHaveLength(0);
  });

  test("bad rows are skipped with a reason and left unmarked", () => {
    const plan = planProcessing(input({}, { resign: [{ rowNumber: 3, row: resign({ branch_code: "XXX" }) }, { rowNumber: 4, row: resign({ effective_date: null }) }] }));
    expect(plan.summary.skipped).toEqual([
      { tab: "Import_Resign", rowNumber: 3, reason: 'ไม่พบรหัสสาขา "XXX"' },
      { tab: "Import_Resign", rowNumber: 4, reason: "ไม่มีวันที่มีผลลาออก" },
    ]);
    expect(plan.importMarks.Import_Resign).toEqual([]);
  });
});

describe("transfers", () => {
  const vacancies = [
    req({ id: "OLD", branch_code: "CNX-001", request_date: "2026-09-01" }),
    req({ id: "NEW", branch_code: "CNX-001", request_date: "2026-10-01" }),
  ];

  test("on the effective date the destination's oldest Vacancy closes as Transfer; the source opens a vacancy", () => {
    const plan = planProcessing(input({ requisitions: vacancies }, { transfer: [{ rowNumber: 2, row: transfer() }] }));
    expect(plan.reqUpdate).toEqual([{ id: "OLD", patch: { status: "Transfer", status_date: "2026-11-15", closed_at: "2026-11-15" }, expectedVersion: 1 }]);
    expect(plan.reqAppend[0]).toMatchObject({ branch_code: "BKK-012", source: "TransferOut", request_date: "2026-11-15" });
    expect(plan.summary).toMatchObject({ transferred: 1, created: 1 });
    expect(plan.importMarks.Import_Transfer).toHaveLength(1);
  });

  test("before the effective date: source vacancy only, row waits unmarked; no source vacancy when disabled", () => {
    const i = input({ requisitions: vacancies }, { transfer: [{ rowNumber: 2, row: transfer({ effective_date: "2026-12-01" }) }] });
    const plan = planProcessing(i);
    expect(plan.reqUpdate).toEqual([]);
    expect(plan.summary).toMatchObject({ waiting: 1, created: 1 });
    expect(plan.importMarks.Import_Transfer).toEqual([]);
    expect(planProcessing(applied(i, plan)).reqAppend).toHaveLength(0);
    const off = planProcessing({ ...i, settings: parseSettings([{ key: "transfer_out_creates_vacancy", value: "0" }]) });
    expect(off.reqAppend).toHaveLength(0);
  });

  test("no Vacancy at the destination goes to review once", () => {
    const i = input({}, { transfer: [{ rowNumber: 2, row: transfer() }] });
    const plan = planProcessing(i);
    expect(plan.reviewAppend).toMatchObject([{ type: "TransferNoReq", ref: "TRIN:E200:2026-11-15" }]);
    const again = applied(i, plan);
    expect(planProcessing({ ...again, imports: i.imports }).reviewAppend).toHaveLength(0);
  });
});

describe("store closures", () => {
  const closed = [branch({ branch_code: "BKK-012", close_date: "2026-11-15" }), branch({ branch_code: "CNX-001" })];
  const pendingApproval: Approval = {
    id: "A1", req_id: "P1", type: "Hold", reason: "", effective_date: today, evidence_url: "", requested_by: "", requested_at: "", status: "Pending", decided_by: "", decided_at: "", decision_note: "",
  };

  test("open requisitions are cancelled, pending approvals closed, Offers sent to review", () => {
    const i = input({
      branches: closed,
      requisitions: [req({ id: "V1" }), req({ id: "P1", status: "PendingHold" }), req({ id: "H1", status: "Hold" }), req({ id: "O1", status: "Offer", offer_id: "OF1" }), req({ id: "X", branch_code: "CNX-001" })],
      offers: [offer({ id: "OF1", req_id: "O1" })],
      approvals: [pendingApproval],
    });
    const plan = planProcessing(i);
    expect(plan.reqUpdate.map((u) => u.id).sort()).toEqual(["H1", "P1", "V1"]);
    expect(plan.reqUpdate[0].patch).toEqual({ status: "Cancel", status_date: "2026-11-15", closed_at: "2026-11-15" });
    expect(plan.approvalUpdate).toMatchObject([{ id: "A1", patch: { status: "Rejected", decision_note: "ปิดอัตโนมัติ: ร้านปิด" } }]);
    expect(plan.reviewAppend).toMatchObject([{ type: "OfferAtClosedStore", ref: "CLOSE:BKK-012:O1" }]);
    expect(nothingToDo(planProcessing(applied(i, plan)))).toBe(0);
  });

  test("a close date in the future does nothing yet", () => {
    const plan = planProcessing(input({ branches: [branch({ branch_code: "BKK-012", close_date: "2026-12-01" })], requisitions: [req({ id: "V1" })] }));
    expect(plan.reqUpdate).toEqual([]);
  });
});

describe("new employees", () => {
  const offered = [req({ id: "O1", status: "Offer", offer_id: "OF1", request_date: "2026-10-02" })];
  const theOffer = [offer({ id: "OF1", req_id: "O1", title: "นาย", first_name: "สมชาย", last_name: "ใจดี", offer_date: "2026-10-20" })];

  test("exactly one match: Hired, moved to NewHires with employee id and start date, removed from Offers", () => {
    const i = input({ requisitions: offered, offers: theOffer }, { newEmployee: [{ rowNumber: 2, row: newEmp({ first_name: "นายสมชาย" }) }] });
    const plan = planProcessing(i);
    expect(plan.reqUpdate).toEqual([{ id: "O1", patch: { status: "Hired", status_date: today, closed_at: today }, expectedVersion: 1 }]);
    expect(plan.newHireAppend[0]).toMatchObject({ id: "OF1", employee_id: "E300", start_date: "2026-11-20", hired_at: today, tat: 18, tat_result: "Meet" });
    expect(plan.offerRemove).toEqual(["OF1"]);
    expect(plan.importMarks.Import_NewEmployee[0].patch).toMatchObject({ matched_req_id: "O1" });
    expect(plan.logAppend).toMatchObject([{ from_status: "Offer", to_status: "Hired", req_id: "O1" }]);
    expect(nothingToDo(planProcessing(applied(i, plan)))).toBe(0);
  });

  test("no match or several matches go to review, row stays unmarked so it is retried", () => {
    const two = [...offered, req({ id: "O2", status: "Offer", offer_id: "OF2" })];
    const twoOffers = [...theOffer, offer({ id: "OF2", req_id: "O2", first_name: "สมชาย", last_name: "ใจดี" })];
    const plan = planProcessing(input({ requisitions: two, offers: twoOffers }, { newEmployee: [{ rowNumber: 2, row: newEmp() }, { rowNumber: 3, row: newEmp({ employee_id: "E9", first_name: "ไม่มี" }) }] }));
    expect(plan.reviewAppend.map((r) => [r.type, r.ref])).toEqual([
      ["UnmatchedHire", "NEW:r2:E300"],
      ["UnmatchedHire", "NEW:r3:E9"],
    ]);
    expect(plan.reviewAppend[0].detail).toMatch(/2 รายการ/);
    expect(plan.importMarks.Import_NewEmployee).toEqual([]);
  });
});

describe("Import_Requisition and Import_Initial", () => {
  test("headcount N creates N requisitions; source must be known", () => {
    const plan = planProcessing(
      input({}, {
        requisition: [
          { rowNumber: 2, row: { branch_code: "CNX-001", position_code: "SM", headcount: 3, request_date: null, source: "NewStore", note: "", processed_at: "" } },
          { rowNumber: 3, row: { branch_code: "CNX-001", position_code: "SM", headcount: 1, request_date: null, source: "Other", note: "", processed_at: "" } },
        ],
      }),
    );
    expect(plan.reqAppend).toHaveLength(3);
    expect(plan.reqAppend.every((r) => r.request_date === today && r.source === "NewStore" && r.ta_email === "")).toBe(true);
    expect(plan.summary.skipped[0].reason).toMatch(/Other/);
  });

  test("go-live rows recreate Offer and Hold state with their real dates", () => {
    const base = { ta_email: "mind@example.com", title: "", first_name: "", last_name: "", offer_date: null, sourcing_channel: "", hold_since: null, processed_at: "" };
    const plan = planProcessing(
      input({}, {
        initial: [
          { rowNumber: 2, row: { ...base, branch_code: "BKK-012", position_code: "SALES", request_date: "2026-09-01", status: "Offer", title: "นาย", first_name: "ก", last_name: "ข", offer_date: "2026-10-01", sourcing_channel: "JobThai" } },
          { rowNumber: 3, row: { ...base, branch_code: "BKK-012", position_code: "SM", request_date: "2026-08-01", status: "Hold", hold_since: "2026-09-15" } },
          { rowNumber: 4, row: { ...base, branch_code: "BKK-012", position_code: "SM", request_date: "2026-08-01", status: "Offer" } },
        ],
      }),
    );
    expect(plan.reqAppend.map((r) => [r.status, r.ta_email])).toEqual([
      ["Offer", "mind@example.com"],
      ["Hold", "mind@example.com"],
    ]);
    expect(plan.offerAppend[0]).toMatchObject({ req_id: plan.reqAppend[0].id, offer_date: "2026-10-01", tat_at_offer: 30 });
    expect(plan.logAppend.filter((e) => e.to_status === "Hold")).toMatchObject([{ effective_date: "2026-09-15" }]);
    expect(plan.summary.skipped).toMatchObject([{ rowNumber: 4 }]);
  });
});
