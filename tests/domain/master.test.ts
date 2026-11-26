import { describe, expect, test } from "vitest";
import { keyOf, planNewRequisitions, planRequisitionEdit, validateMaster, type MasterContext } from "@/lib/domain/master";
import { branch, positions, req, user } from "./helpers";

const ju = user({ email: "ju@example.com", role: "super_admin", name: "จู" });
const mind = user({ email: "mind@example.com", name: "มายด์" });
const boss = user({ email: "boss@example.com", role: "viewer" });
const branches = [branch({ branch_code: "BKK-012", region: "ภาคกลาง" }), branch({ branch_code: "CNX-001", region: "ภาคเหนือ" })];
const ctx = (over: Partial<MasterContext> = {}): MasterContext => ({
  existingKeys: new Set(), originalKey: null, branches, positions, users: [ju, mind, boss], viewer: ju, ...over,
});
const now = new Date("2026-11-18T03:00:00.000Z");

describe("validateMaster", () => {
  test("branch: normalises code, requires name and region, checks dates and uniqueness", () => {
    const ok = validateMaster("Branches", { branch_code: "kkn-008", branch_name: " ขอนแก่น ", region: "ภาคอีสาน", status: "Open", close_date: "31/12/2026" }, ctx());
    expect(ok.ok && ok.value).toMatchObject({ branch_code: "KKN-008", branch_name: "ขอนแก่น", close_date: "2026-12-31", open_date: null });
    const bad = validateMaster("Branches", { branch_code: "BKK-012", branch_name: "", region: "", open_date: "2026-12-01", close_date: "2026-11-01" }, ctx({ existingKeys: new Set(["BKK-012"]) }));
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(["branch_code", "branch_name", "close_date", "region"]);
  });

  test("branch: keeps AM and RM, trimmed", () => {
    const ok = validateMaster("Branches", { branch_code: "A1", branch_name: "x", region: "ภาคกลาง", status: "Open", am: " โชคชัย ", rm: "ฐกรกฤตย์" }, ctx());
    expect(ok.ok && ok.value).toMatchObject({ am: "โชคชัย", rm: "ฐกรกฤตย์" });
  });

  test("editing keeps the original key and doesn't clash with itself", () => {
    const r = validateMaster("Branches", { branch_code: "OTHER", branch_name: "x", region: "ภาคกลาง" }, ctx({ originalKey: "BKK-012", existingKeys: new Set(["BKK-012"]) }));
    expect(r.ok && r.value.branch_code).toBe("BKK-012");
  });

  test("position SLA is blank (default) or 1–365", () => {
    expect(validateMaster("Positions", { position_code: "pc", position_name: "PC", sla_days: "" }, ctx()).ok).toBe(true);
    const r = validateMaster("Positions", { position_code: "PC", position_name: "PC", sla_days: "0" }, ctx());
    expect(!r.ok && r.errors.sla_days).toBeTruthy();
  });

  test("assignment needs a known branch/group and an active TA; one per branch + group", () => {
    expect(validateMaster("RecruiterAssignments", { branch_code: "BKK-012", position_group: "Store", ta_email: "MIND@example.com" }, ctx()).ok).toBe(true);
    const r = validateMaster("RecruiterAssignments", { branch_code: "XXX", position_group: "Nope", ta_email: "boss@example.com" }, ctx());
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["branch_code", "position_group", "ta_email"]);
    const dup = validateMaster("RecruiterAssignments", { branch_code: "BKK-012", position_group: "", ta_email: "mind@example.com" }, ctx({ existingKeys: new Set(["BKK-012|"]) }));
    expect(!dup.ok && dup.errors.position_group).toMatch(/ทุกตำแหน่ง/);
  });

  test("users: scope tokens must be known; nobody can lock themselves or everyone out", () => {
    expect(validateMaster("Users", { email: "new@x.com", name: "N", role: "viewer", scope: "ภาคเหนือ, BKK-012", active: "on" }, ctx()).ok).toBe(true);
    const scope = validateMaster("Users", { email: "new@x.com", name: "N", role: "viewer", scope: "ภาคใต้ล่าง", active: "on" }, ctx());
    expect(!scope.ok && scope.errors.scope).toMatch(/ภาคใต้ล่าง/);
    const self = validateMaster("Users", { name: "จู", role: "ta", active: "on" }, ctx({ originalKey: "ju@example.com", existingKeys: new Set(["ju@example.com"]) }));
    expect(!self.ok && self.errors.role).toMatch(/ของตัวเองไม่ได้/);
    const other = user({ email: "x@example.com", role: "super_admin" });
    const last = validateMaster("Users", { name: "X", role: "super_admin", active: "" }, ctx({ viewer: other, users: [other, mind], originalKey: "x@example.com" }));
    expect(!last.ok && last.errors.role).toBeTruthy();
  });

  test("keys are case-insensitive where people type them", () => {
    expect(keyOf("SourcingChannels", { channel: " JobThai " })).toBe("jobthai");
    expect(keyOf("RecruiterAssignments", { branch_code: "bkk-012", position_group: "Store" })).toBe("BKK-012|store");
  });
});

describe("planNewRequisitions", () => {
  let n = 0;
  const ids = () => ({ reqId: `REQ-${++n}`, logId: `LOG-${n}` });
  const base = { branches, positions, assignments: [{ branch_code: "BKK-012", position_group: "", ta_email: "mind@example.com" }], users: [ju, mind], viewer: ju, today: "2026-11-18", ids, now };

  test("headcount N -> N Vacancy rows, TA from assignments when not chosen", () => {
    const r = planNewRequisitions({ ...base, input: { branch_code: "BKK-012", position_code: "SALES", headcount: "3", source: "Project", request_date: "" } });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value.requisitions).toHaveLength(3);
    expect(r.value.requisitions[0]).toMatchObject({ status: "Vacancy", request_date: "2026-11-18", source: "Project", ta_email: "mind@example.com" });
    expect(r.value.log).toHaveLength(3);
  });

  test("validation and super_admin only", () => {
    const r = planNewRequisitions({ ...base, input: { branch_code: "X", position_code: "Y", headcount: "0", source: "Z" } });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["branch_code", "headcount", "position_code", "source"]);
    expect(planNewRequisitions({ ...base, viewer: mind, input: { branch_code: "BKK-012", position_code: "SALES" } }).ok).toBe(false);
  });
});

describe("planRequisitionEdit", () => {
  let n = 0;
  const args = (input: Partial<{ requestDate: string; taEmail: string; reason: string }>, viewer = ju) => ({
    req: req({ id: "R1", request_date: "2026-10-02", ta_email: "mind@example.com" }),
    input: { requestDate: "2026-10-02", taEmail: "mind@example.com", reason: "แก้ตามเอกสาร", ...input },
    users: [ju, mind],
    viewer,
    ids: () => `LOG-${++n}`,
    now,
  });

  test("logs request date and owner changes with old -> new", () => {
    const r = planRequisitionEdit(args({ requestDate: "01/10/2026", taEmail: "ju@example.com" }));
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value.patch).toEqual({ request_date: "2026-10-01", ta_email: "ju@example.com" });
    expect(r.value.log.map((e) => [e.to_status, e.note])).toEqual([
      ["RequestDateChange", "วันที่แจ้งสรรหา 02/10/2026 → 01/10/2026: แก้ตามเอกสาร"],
      ["OwnerChange", "เจ้าของ มายด์ → จู: แก้ตามเอกสาร"],
    ]);
  });

  test("needs a reason, a change, and super_admin", () => {
    expect(planRequisitionEdit(args({ reason: "" })).ok).toBe(false);
    const same = planRequisitionEdit(args({}));
    expect(!same.ok && same.errors.form).toMatch(/ไม่มีอะไรเปลี่ยน/);
    expect(planRequisitionEdit(args({ requestDate: "2026-10-01" }, mind)).ok).toBe(false);
  });
});
