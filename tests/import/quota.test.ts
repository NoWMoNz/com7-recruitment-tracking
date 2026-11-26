import { describe, expect, it } from "vitest";
import { branchName, closedDate, codesFromSummary, convertQuota, peopleFromZone, reportDateFromName, type QuotaRow } from "@/lib/import/quota";

const row = (p: Partial<QuotaRow>): QuotaRow => ({
  id: "103",
  shop: "ID 103_Studio 7_Paradise Park_Srinakarin",
  brand: "Studio7",
  bu: "Apple",
  region: "กรุงเทพมหานคร",
  province: "กรุงเทพมหานคร",
  position: "",
  quota: 0,
  actual: 0,
  vacant: 0,
  ...p,
});

describe("helpers", () => {
  it("cleans the shop name", () => {
    expect(branchName("ID 103_Studio 7_Paradise Park_Srinakarin")).toBe("Studio 7 Paradise Park Srinakarin");
    expect(branchName("ID9_BN_Zeer_Rangsit_2.1")).toBe("BN Zeer Rangsit 2.1");
  });

  it("reads the closing date from a shop name, Buddhist year in 2 or 4 digits", () => {
    expect(closedDate("ID 1831_BBP-MarketVillage-Bangphli-Samutprakan(ปิด25/10/69)")).toBe("2026-10-25");
    expect(closedDate("ID 5_X (ปิด 9/9/2569)")).toBe("2026-09-09");
    expect(closedDate("ID 103_Studio 7_Paradise Park_Srinakarin")).toBeNull();
    expect(closedDate("ID 7_X(ปิด31/2/69)")).toBeNull(); // not a real day
    expect(closedDate("ID 7_X(ปิด)")).toBeNull();
  });

  it("drops the closing marker from the branch name", () => {
    expect(branchName("ID 1831_BBP-MarketVillage-Bangphli(ปิด25/10/69)")).toBe("BBP-MarketVillage-Bangphli");
  });

  it("reads the report date from the file name", () => {
    expect(reportDateFromName("Quota Branch 11 Nov 2026.xls")).toBe("2026-11-11");
    expect(reportDateFromName("Quota Branch 3 September 2026.xlsx")).toBe("2026-09-03");
    expect(reportDateFromName("quota.xlsx")).toBeNull();
  });

  it("takes position codes from indented lines only", () => {
    const { codes, warnings } = codesFromSummary([
      { code: "รหัสหน่วยงาน", name: "ชื่อหน่วยงาน" },
      { code: "    รหัสตำแหน่ง", name: "    ชื่อตำแหน่งงาน" },
      { code: "A-ID 103", name: "ID 103_Studio 7" },
      { code: "    BSM", name: "    Branch Sales Manager" },
      { code: "    PIA", name: "    PIA" },
      { code: "    BSM", name: "    Branch Sales Manager" },
      { code: "    BSM2", name: "    Branch Sales Manager" },
    ]);
    expect([...codes]).toEqual([
      ["Branch Sales Manager", "BSM"],
      ["PIA", "PIA"],
    ]);
    expect(warnings).toHaveLength(1);
  });
});

describe("convertQuota", () => {
  const codes = new Map([
    ["PIA", "PIA"],
    ["Branch Sales Manager", "BSM"],
    ["Part Time", "Part Time"],
  ]);

  it("a shop marked closed becomes a Closed branch with its date and opens no vacancies", () => {
    const out = convertQuota(
      [
        row({ id: "1831", shop: "ID 1831_BBP-MarketVillage(ปิด25/10/69)", quota: 4, actual: 0, vacant: 4 }),
        row({ id: "1831", shop: "ID 1831_BBP-MarketVillage(ปิด25/10/69)", position: "PIA", quota: 3, actual: 0, vacant: 3 }),
        row({ id: "103", position: "PIA", quota: 3, actual: 1, vacant: 2 }),
      ],
      codes,
      "2026-11-11",
    );
    expect(out.branches.map((b) => [b.branch_code, b.status, b.close_date, b.branch_name])).toEqual([
      ["1831", "Closed", "2026-10-25", "BBP-MarketVillage"],
      ["103", "Open", null, "Studio 7 Paradise Park Srinakarin"],
    ]);
    expect(out.initial.map((i) => i.branch_code)).toEqual(["103", "103"]);
    expect(out.summary).toMatchObject({ closedBranches: 1, closedOpenings: 3, openings: 2 });
  });

  it("keeps quota and actual for every position line, including over, empty and closed shops", () => {
    const out = convertQuota(
      [
        row({ quota: 8, actual: 4, vacant: 4 }), // branch total line: no position, not a Quota line
        row({ position: "PIA", quota: 3, actual: 1, vacant: 2 }),
        row({ position: "Branch Sales Manager", quota: 1, actual: 1, vacant: 0 }),
        row({ position: "Part Time", quota: 0, actual: 2, vacant: -2 }),
        row({ position: "ตำแหน่งที่ไม่มีรหัส", quota: 2, actual: 0, vacant: 2 }),
        row({ id: "1831", shop: "ID 1831_BBP-X(ปิด25/10/69)", position: "PIA", quota: 3, actual: 0, vacant: 3 }),
      ],
      codes,
      "2026-11-11",
    );
    expect(out.quota).toEqual([
      { branch_code: "103", position_code: "PIA", quota: 3, actual: 1, report_date: "2026-11-11" },
      { branch_code: "103", position_code: "BSM", quota: 1, actual: 1, report_date: "2026-11-11" },
      { branch_code: "103", position_code: "Part Time", quota: 0, actual: 2, report_date: "2026-11-11" },
      { branch_code: "1831", position_code: "PIA", quota: 3, actual: 0, report_date: "2026-11-11" },
    ]);
  });

  it("keeps both groups: Group เล็ก as brand and Group ใหญ่ as BU", () => {
    const out = convertQuota([row({}), row({ id: "9", shop: "ID9_BN_Zeer_Rangsit", brand: "BaNANA", bu: "BaNANA" })], codes, "2026-11-11");
    expect(out.branches.map((b) => [b.branch_code, b.brand, b.bu])).toEqual([
      ["103", "Studio7", "Apple"],
      ["9", "BaNANA", "BaNANA"],
    ]);
  });

  it("makes branches, positions and one vacancy per person short", () => {
    const out = convertQuota(
      [
        row({ quota: 4, actual: 5, vacant: -1 }),
        row({ position: "Branch Sales Manager", quota: 1, actual: 1, vacant: 0 }),
        row({ position: "PIA", quota: 3, actual: 1, vacant: 2 }),
        row({ position: "Part Time", quota: 0, actual: 2, vacant: -2 }),
        row({ id: "105", shop: "ID 105_Studio 7_Central_Khonkaen", region: "ภาคตะวันออกเฉียงเหนือ", province: "ขอนแก่น", position: "PIA", quota: 8, actual: 7, vacant: 1 }),
      ],
      codes,
      "2026-11-11",
    );
    expect(out.branches.map((b) => [b.branch_code, b.branch_name, b.region, b.province, b.status])).toEqual([
      ["103", "Studio 7 Paradise Park Srinakarin", "กรุงเทพมหานคร", "กรุงเทพมหานคร", "Open"],
      ["105", "Studio 7 Central Khonkaen", "ภาคตะวันออกเฉียงเหนือ", "ขอนแก่น", "Open"],
    ]);
    expect(out.positions.map((p) => p.position_code)).toEqual(["BSM", "PIA", "Part Time"]);
    expect(out.initial.map((r) => `${r.branch_code}:${r.position_code}:${r.request_date}:${r.status}`)).toEqual([
      "103:PIA:2026-11-11:Vacancy",
      "103:PIA:2026-11-11:Vacancy",
      "105:PIA:2026-11-11:Vacancy",
    ]);
    expect(out.summary).toEqual({ branches: 2, positions: 3, openings: 3, shortRows: 2, over: 2, closedBranches: 0, closedOpenings: 0 });
    expect(out.warnings).toEqual([]);
  });

  it("skips positions it has no code for and says so", () => {
    const out = convertQuota([row({ position: "Mystery Role", quota: 2, vacant: 2 })], codes, "2026-11-11");
    expect(out.initial).toHaveLength(0);
    expect(out.warnings).toEqual(['ไม่พบรหัสของตำแหน่ง "Mystery Role" ในชีต Quota01_Summary จึงข้ามไป']);
  });

  it("warns when one branch is listed with two regions", () => {
    const out = convertQuota([row({}), row({ region: "ปริมณฑล" })], codes, "2026-11-11");
    expect(out.branches[0].region).toBe("กรุงเทพมหานคร");
    expect(out.warnings).toHaveLength(1);
  });
});

describe("AM / RM from the Zone sheet", () => {
  it("uses the named row of a repeated ID; '-' and blanks are empty", () => {
    const { byId, warnings } = peopleFromZone([
      { id: "300", am: "", rm: "" },
      { id: "300", am: "สุไลมาน", rm: "ชัยรัตน์" },
      { id: "9", am: "-", rm: " ฐกรกฤตย์ " },
    ]);
    expect(byId.get("300")).toEqual({ am: "สุไลมาน", rm: "ชัยรัตน์" });
    expect(byId.get("9")).toEqual({ am: "", rm: "ฐกรกฤตย์" });
    expect(warnings).toEqual([]);
  });

  it("keeps the first of two different named rows and warns", () => {
    const { byId, warnings } = peopleFromZone([
      { id: "5", am: "ก", rm: "R" },
      { id: "5", am: "ข", rm: "R" },
    ]);
    expect(byId.get("5")).toEqual({ am: "ก", rm: "R" });
    expect(warnings).toHaveLength(1);
  });

  it("puts each branch's AM / RM on it, empty when the Zone sheet has none", () => {
    const people = new Map([["103", { am: "ก", rm: "R" }]]);
    expect(convertQuota([row({})], new Map(), "2026-11-11", people).branches[0]).toMatchObject({ am: "ก", rm: "R" });
    expect(convertQuota([row({})], new Map(), "2026-11-11").branches[0]).toMatchObject({ am: "", rm: "" });
  });
});
