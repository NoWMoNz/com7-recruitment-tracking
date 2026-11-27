import { describe, expect, test } from "vitest";
import { branchHeads, branchLabel, branchTaOf, matchesPeople, peopleOfBranch, peopleOptions, taOf } from "@/lib/domain/people";
import { branch, req, user } from "./helpers";

describe("matchesPeople", () => {
  const x = { am: "A", rm: "R", ta: "Mind@x.com" };
  test("TA matches whatever the case", () => {
    expect(matchesPeople(x, { ta: "mind@x.com" })).toBe(true);
    expect(matchesPeople({ am: "", rm: "", ta: "Chuthathip" }, { ta: "chuthathip" })).toBe(true);
  });
  test("a different AM does not match; no filter matches everything", () => {
    expect(matchesPeople(x, { am: "B" })).toBe(false);
    expect(matchesPeople(x, {})).toBe(true);
  });
  test("a branch without names never matches a set filter", () => {
    expect(matchesPeople({ am: "", rm: "", ta: "" }, { rm: "R" })).toBe(false);
  });
});

describe("peopleOptions", () => {
  test("sorted, blanks skipped, TAs deduped by key with their name as label", () => {
    expect(
      peopleOptions([
        { am: "ข", rm: "", ta: "a@x.com", taName: "เอ" },
        { am: "ก", rm: "R", ta: "A@x.com" },
        { am: "", rm: "", ta: "Chuthathip", taName: "Chuthathip" },
        { am: "", rm: "", ta: "" },
      ]),
    ).toEqual({ ams: ["ก", "ข"], rms: ["R"], tas: [{ value: "a@x.com", label: "เอ" }, { value: "chuthathip", label: "Chuthathip" }] });
  });
});

describe("branchLabel", () => {
  test("the shop's full name from HR's database", () => {
    expect(branchLabel("105", branch({ branch_code: "105", branch_name: "Studio 7 Central Khonkaen", full_name: " ID 105_Studio 7_Central_Khonkaen " }))).toBe("ID 105_Studio 7_Central_Khonkaen");
  });
  test("without one, the same pattern built from the code and the name; an unknown shop is its code", () => {
    expect(branchLabel("1060", branch({ branch_code: "1060", branch_name: "BB Emquartier Sukhumvit" }))).toBe("ID 1060_BB Emquartier Sukhumvit");
    expect(branchLabel("9999", undefined)).toBe("ID 9999");
  });
});

describe("taOf", () => {
  const names = (e: string) => ({ "mind@example.com": "มายด์" })[e];
  test("the shop's TA from HR's database wins over the requisition's owner", () => {
    expect(taOf(branch({ branch_code: "B1", ta: " Chuthathip " }), "mind@example.com", names)).toEqual({ ta: "chuthathip", taName: "Chuthathip" });
  });
  test("a TA name set on the position itself wins over the shop's", () => {
    expect(taOf(branch({ branch_code: "B1", ta: "Chuthathip" }), "mind@example.com", names, " Ameena ")).toEqual({ ta: "ameena", taName: "Ameena" });
  });
  test("otherwise the owner, by their account name; nobody gives blanks", () => {
    expect(taOf(branch({ branch_code: "B1" }), "Mind@Example.com", names)).toEqual({ ta: "mind@example.com", taName: "มายด์" });
    expect(taOf(branch({ branch_code: "B1" }), "x@example.com", names)).toEqual({ ta: "x@example.com", taName: "x@example.com" });
    expect(taOf(undefined, "", names)).toEqual({ ta: "", taName: "" });
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

describe("branchHeads", () => {
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

  test("a shop with a TA from HR's database shows that name", () => {
    const named = branchHeads(["B1"], [branch({ branch_code: "B1", ta: "Chuthathip" })], rules, reqs, []);
    expect(named.B1).toMatchObject({ taName: "Chuthathip", taEmail: "mind@example.com" });
  });
});
