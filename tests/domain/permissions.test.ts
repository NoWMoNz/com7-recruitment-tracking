import { describe, expect, test } from "vitest";
import { canEditRequisition, findActiveUser, inScope, normalizeEmail } from "@/lib/domain/permissions";
import { branch, req, user } from "./helpers";

const central = branch({ branch_code: "BKK-012", region: "ภาคกลาง" });
const north = branch({ branch_code: "CNX-001", region: "ภาคเหนือ" });

describe("normalizeEmail / findActiveUser", () => {
  test("case and whitespace insensitive, inactive ignored", () => {
    expect(normalizeEmail(" Ju@Com7.co.th ")).toBe("ju@com7.co.th");
    const users = [user({ email: "Ju@Com7.co.th " }), user({ email: "old@com7.co.th", active: false })];
    expect(findActiveUser(users, "ju@com7.co.th")?.email).toBe("Ju@Com7.co.th ");
    expect(findActiveUser(users, "old@com7.co.th")).toBeNull();
  });
});

describe("inScope", () => {
  test("empty scope sees all", () => {
    expect(inScope(user({ email: "a@x", scope: "" }), north)).toBe(true);
  });
  test("region scope", () => {
    const u = user({ email: "a@x", scope: "ภาคกลาง" });
    expect(inScope(u, central)).toBe(true);
    expect(inScope(u, north)).toBe(false);
  });
  test("branch code list", () => {
    expect(inScope(user({ email: "a@x", scope: "BKK-012, cnx-001" }), north)).toBe(true);
  });
});

describe("canEditRequisition", () => {
  const r = req({ id: "R1", ta_email: " Mind@Com7.co.th" });
  test("super_admin always", () => {
    expect(canEditRequisition(user({ email: "ju@x", role: "super_admin" }), r)).toBe(true);
  });
  test("admin works on every position; a viewer on none", () => {
    expect(canEditRequisition(user({ email: "ad@x", role: "admin" }), r)).toBe(true);
    expect(canEditRequisition(user({ email: "mind@com7.co.th", role: "viewer" }), r)).toBe(false);
  });
  test("ta only own", () => {
    expect(canEditRequisition(user({ email: "mind@com7.co.th" }), r)).toBe(true);
    expect(canEditRequisition(user({ email: "other@com7.co.th" }), r)).toBe(false);
  });
  test("viewer never", () => {
    expect(canEditRequisition(user({ email: "mind@com7.co.th", role: "viewer" }), r)).toBe(false);
  });
});
