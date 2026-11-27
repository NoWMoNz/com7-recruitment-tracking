import { describe, expect, test } from "vitest";
import { planBranchTaName, planRequisitionTaName } from "@/lib/domain/branch-ta";
import { branch, req, user } from "./helpers";

const mind = user({ email: "mind@example.com", name: "มายด์" });
const admin = user({ email: "ad@example.com", role: "admin" });
const boss = user({ email: "boss@example.com", role: "viewer" });
const north = user({ email: "n@example.com", role: "admin", scope: "ภาคเหนือ" });
const users = [mind, admin, boss];
const b1 = branch({ branch_code: "B1", region: "ภาคกลาง", ta: "Chuthathip" });
const now = new Date("2026-11-27T03:00:00.000Z");
const today = "2026-11-27";

const requisitions = [
  req({ id: "r1", branch_code: "B1", status: "Vacancy" }),
  req({ id: "r2", branch_code: "B1", status: "Hold", ta_name: "Ameena", version: 4 }),
  req({ id: "r3", branch_code: "B1", status: "Hired" }),
  req({ id: "r4", branch_code: "B2", status: "Vacancy" }),
];

let n = 0;
const ids = () => `LOG-${++n}`;

describe("planBranchTaName", () => {
  const plan = (over: Partial<Parameters<typeof planBranchTaName>[0]> = {}) =>
    planBranchTaName({ branch: b1, name: " Pornchuta ", viewer: admin, users, requisitions, ids, now, today, ...over });

  test("the shop's TA becomes the name; its open positions follow it (their own names are cleared) and are logged", () => {
    const p = plan();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.branchTa).toBe("Pornchuta");
    expect(p.value.reqPatches).toEqual([{ id: "r2", patch: { ta_name: "" }, expectedVersion: 4 }]);
    expect(p.value.log.map((e) => [e.req_id, e.to_status, e.note])).toEqual([
      ["r1", "OwnerChange", "TA Chuthathip → Pornchuta: เปลี่ยน TA ประจำสาขา"],
      ["r2", "OwnerChange", "TA Ameena → Pornchuta: เปลี่ยน TA ประจำสาขา"],
    ]);
    expect(p.value.log[0]).toMatchObject({ actor: "ad@example.com", effective_date: today, at: now.toISOString() });
  });

  test("a TA and super_admin may too; a viewer, a shop outside the scope, a blank name or no change may not", () => {
    expect(plan({ viewer: mind }).ok).toBe(true);
    expect(plan({ viewer: boss })).toMatchObject({ ok: false, errors: { form: expect.stringContaining("TA") } });
    expect(plan({ viewer: north })).toMatchObject({ ok: false, errors: { form: "ไม่พบสาขานี้ในขอบเขตของคุณ" } });
    expect(plan({ name: "  " })).toMatchObject({ ok: false, errors: { name: "กรอกชื่อ TA" } });
    expect(plan({ name: "chuthathip", requisitions: requisitions.filter((r) => r.id !== "r2") })).toMatchObject({ ok: false, errors: { form: "ไม่มีอะไรเปลี่ยน" } });
  });
});

describe("planRequisitionTaName", () => {
  const r1 = requisitions[0];
  const plan = (over: Partial<Parameters<typeof planRequisitionTaName>[0]> = {}) =>
    planRequisitionTaName({ req: r1, branch: b1, name: "Ameena", viewer: admin, users, ids, now, today, ...over });

  test("sets the position's own TA name and logs it", () => {
    const p = plan();
    expect(p.ok && p.value.patch).toEqual({ ta_name: "Ameena" });
    expect(p.ok && p.value.log.note).toBe("TA Chuthathip → Ameena: เฉพาะตำแหน่งนี้");
  });

  test("picking the shop's own TA clears the position's name, so it follows the shop again", () => {
    const p = plan({ req: requisitions[1], name: "CHUTHATHIP" });
    expect(p.ok && p.value.patch).toEqual({ ta_name: "" });
    expect(p.ok && p.value.expectedVersion).toBe(4);
  });

  test("only who may work on the position, only while it is open, and only a real change", () => {
    expect(plan({ viewer: boss })).toMatchObject({ ok: false, errors: { form: "คุณไม่ได้เป็นผู้รับผิดชอบตำแหน่งนี้" } });
    expect(plan({ req: requisitions[2] })).toMatchObject({ ok: false, errors: { form: "ตำแหน่งนี้ปิดแล้ว" } });
    expect(plan({ name: "chuthathip" })).toMatchObject({ ok: false, errors: { form: "ไม่มีอะไรเปลี่ยน" } });
    expect(plan({ name: "" })).toMatchObject({ ok: false, errors: { name: "กรอกชื่อ TA" } });
  });
});
