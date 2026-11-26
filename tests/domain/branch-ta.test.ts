import { describe, expect, test } from "vitest";
import { planBranchTaChange } from "@/lib/domain/branch-ta";
import type { RecruiterAssignment } from "@/lib/repo/types";
import { branch, req, user } from "./helpers";

const mind = user({ email: "mind@example.com" });
const ploy = user({ email: "ploy@example.com" });
const boss = user({ email: "boss@example.com", role: "viewer" });
const ju = user({ email: "ju@example.com", role: "super_admin" });
const users = [mind, ploy, boss, ju];
const b1 = branch({ branch_code: "B1", region: "ภาคกลาง" });
const now = new Date("2026-11-24T03:00:00.000Z");
const today = "2026-11-24";

const requisitions = [
  req({ id: "r1", branch_code: "B1", status: "Vacancy", ta_email: "mind@example.com" }),
  req({ id: "r2", branch_code: "B1", status: "Hold", ta_email: "Mind@example.com" }),
  req({ id: "r3", branch_code: "B1", status: "Offer", ta_email: "ploy@example.com" }),
  req({ id: "r4", branch_code: "B1", status: "Hired", ta_email: "mind@example.com" }),
  req({ id: "r5", branch_code: "B2", status: "Vacancy", ta_email: "mind@example.com" }),
];
const assignments: { rowNumber: number; row: RecruiterAssignment }[] = [
  { rowNumber: 2, row: { branch_code: "B1", position_group: "", ta_email: "mind@example.com" } },
  { rowNumber: 3, row: { branch_code: "B1", position_group: "Service", ta_email: "mind@example.com" } },
  { rowNumber: 5, row: { branch_code: "B2", position_group: "", ta_email: "mind@example.com" } },
];

let n = 0;
const plan = (over: Partial<Parameters<typeof planBranchTaChange>[0]> = {}) =>
  planBranchTaChange({ branch: b1, taEmail: "PLOY@example.com", viewer: mind, users, assignments, requisitions, ids: () => `LOG-${++n}`, now, today, ...over });

describe("planBranchTaChange", () => {
  test("replaces the branch's rules with one branch-wide rule and moves its not-closed positions", () => {
    const p = plan();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.removeRows).toEqual([2, 3]);
    expect(p.value.assignment).toEqual({ branch_code: "B1", position_group: "", ta_email: "ploy@example.com" });
    expect(p.value.reqPatches).toEqual([
      { id: "r1", patch: { ta_email: "ploy@example.com" }, expectedVersion: 1 },
      { id: "r2", patch: { ta_email: "ploy@example.com" }, expectedVersion: 1 },
    ]);
    expect(p.value.log.map((e) => [e.req_id, e.from_status, e.to_status, e.note, e.effective_date, e.actor])).toEqual([
      ["r1", "Vacancy", "OwnerChange", "เจ้าของ mind → ploy: เปลี่ยน TA ประจำสาขา", today, "mind@example.com"],
      ["r2", "Hold", "OwnerChange", "เจ้าของ mind → ploy: เปลี่ยน TA ประจำสาขา", today, "mind@example.com"],
    ]);
  });

  test("handing it to the TA it already belongs to still gathers stray positions and rewrites the rules", () => {
    const p = plan({ taEmail: "mind@example.com" });
    expect(p.ok && p.value.reqPatches.map((x) => x.id)).toEqual(["r3"]);
    expect(p.ok && p.value.removeRows).toEqual([2, 3]);
  });

  test("a viewer cannot change it", () => {
    const p = plan({ viewer: boss });
    expect(!p.ok && p.errors.form).toBe("เปลี่ยน TA ได้เฉพาะ TA และผู้ดูแลระบบ");
  });

  test("a branch outside the viewer's scope, or unknown, is refused", () => {
    const out = plan({ viewer: user({ email: "mind@example.com", scope: "ภาคเหนือ" }) });
    expect(!out.ok && out.errors.form).toBe("ไม่พบสาขานี้ในขอบเขตของคุณ");
    const p = plan({ branch: undefined });
    expect(!p.ok && p.errors.form).toBe("ไม่พบสาขานี้ในขอบเขตของคุณ");
  });

  test("the new owner must be an active TA or admin", () => {
    const p = plan({ taEmail: "boss@example.com" });
    expect(!p.ok && p.errors.taEmail).toBe("เลือก TA ที่ยังใช้งานอยู่");
  });

  test("nothing to change is reported", () => {
    const p = plan({
      assignments: [{ rowNumber: 2, row: { branch_code: "B1", position_group: "", ta_email: "ploy@example.com" } }],
      requisitions: [req({ id: "r3", branch_code: "B1", status: "Offer", ta_email: "ploy@example.com" })],
    });
    expect(!p.ok && p.errors.form).toBe("ไม่มีอะไรเปลี่ยน");
  });
});
