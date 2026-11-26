import { describe, expect, test } from "vitest";
import { branchHeads, branchTaOf, handOverPreview, matchesPeople, peopleOfBranch, peopleOptions } from "@/lib/domain/people";
import { branch, req, user } from "./helpers";

describe("matchesPeople", () => {
  const x = { am: "A", rm: "R", taEmail: "Mind@x.com" };
  test("TA matches whatever the email's case", () => {
    expect(matchesPeople(x, { ta: "mind@x.com" })).toBe(true);
  });
  test("a different AM does not match; no filter matches everything", () => {
    expect(matchesPeople(x, { am: "B" })).toBe(false);
    expect(matchesPeople(x, {})).toBe(true);
  });
  test("a branch without names never matches a set filter", () => {
    expect(matchesPeople({ am: "", rm: "", taEmail: "" }, { rm: "R" })).toBe(false);
  });
});

describe("peopleOptions", () => {
  test("sorted, blanks skipped, TAs deduped by email with their name as label", () => {
    expect(
      peopleOptions([
        { am: "ข", rm: "", taEmail: "a@x.com", taName: "เอ" },
        { am: "ก", rm: "R", taEmail: "A@x.com" },
        { am: "", rm: "", taEmail: "" },
      ]),
    ).toEqual({ ams: ["ก", "ข"], rms: ["R"], tas: [{ value: "a@x.com", label: "เอ" }] });
  });
});

describe("branchTaOf", () => {
  test("the branch-wide assignment wins", () => {
    expect(branchTaOf("B1", [{ branch_code: "B1", position_group: "", ta_email: "Ploy@x.com" }], [])).toBe("ploy@x.com");
  });
  test("otherwise the TA owning most not-closed positions (closed ones ignored)", () => {
    const reqs = [
      req({ id: "1", branch_code: "B1", ta_email: "mind@example.com", status: "Vacancy" }),
      req({ id: "2", branch_code: "B1", ta_email: "mind@example.com", status: "Hold" }),
      req({ id: "3", branch_code: "B1", ta_email: "ploy@example.com", status: "Offer" }),
      req({ id: "4", branch_code: "B1", ta_email: "ploy@example.com", status: "Cancel" }),
      req({ id: "5", branch_code: "B1", ta_email: "ploy@example.com", status: "Hired" }),
    ];
    expect(branchTaOf("B1", [{ branch_code: "B1", position_group: "Store", ta_email: "ploy@example.com" }], reqs)).toBe("mind@example.com");
  });
  test("nothing known gives an empty string", () => {
    expect(branchTaOf("B1", [], [])).toBe("");
  });
});

describe("peopleOfBranch", () => {
  test("trimmed names, empty for a missing branch", () => {
    expect(peopleOfBranch(branch({ branch_code: "B1", am: " ก ", rm: "R" }))).toEqual({ am: "ก", rm: "R" });
    expect(peopleOfBranch(undefined)).toEqual({ am: "", rm: "" });
  });
});

describe("branchHeads / handOverPreview", () => {
  const reqs = [
    req({ id: "1", branch_code: "B1", ta_email: "Mind@example.com", status: "Vacancy" }),
    req({ id: "2", branch_code: "B1", ta_email: "mind@example.com", status: "Hold" }),
    req({ id: "3", branch_code: "B1", ta_email: "ploy@example.com", status: "Offer" }),
    req({ id: "4", branch_code: "B1", ta_email: "ploy@example.com", status: "Hired" }),
  ];
  const rules = [
    { branch_code: "B1", position_group: "", ta_email: "mind@example.com" },
    { branch_code: "B2", position_group: "", ta_email: "ploy@example.com" },
  ];
  const heads = branchHeads(["B1", "B2", "ZZ"], [branch({ branch_code: "B1", am: "ก" }), branch({ branch_code: "B2" })], rules, reqs, [user({ email: "mind@example.com", name: "มายด์" })]);

  test("one header per branch: people, TA, not-closed counts per owner, the single branch-wide rule, and whether the branch is known", () => {
    expect(heads.B1).toEqual({ am: "ก", rm: "", taEmail: "mind@example.com", taName: "มายด์", open: 3, owned: { "mind@example.com": 2, "ploy@example.com": 1 }, ruleOnlyFor: "mind@example.com", known: true });
    expect(heads.B2).toMatchObject({ open: 0, owned: {}, ruleOnlyFor: "ploy@example.com", taName: "ploy@example.com" });
    expect(heads.ZZ).toMatchObject({ known: false, taEmail: "" });
  });

  test("handing a branch to the TA already shown still gathers positions others own", () => {
    expect(handOverPreview(heads.B1, "mind@example.com")).toEqual({ moving: 1, changes: true });
  });
  test("nothing to move and the same single rule changes nothing", () => {
    expect(handOverPreview({ ...heads.B1, owned: { "mind@example.com": 3 } }, "MIND@example.com")).toEqual({ moving: 0, changes: false });
  });
  test("another TA takes every position they do not own yet", () => {
    expect(handOverPreview(heads.B1, "ploy@example.com")).toEqual({ moving: 2, changes: true });
    expect(handOverPreview(heads.B1, "")).toEqual({ moving: 0, changes: false });
  });
});
