import { describe, expect, it } from "vitest";
import { branchName, codesFromSummary, convertQuota, reportDateFromName, type QuotaRow } from "@/lib/import/quota";

const row = (p: Partial<QuotaRow>): QuotaRow => ({
  id: "103",
  shop: "ID 103_Studio 7_Paradise Park_Srinakarin",
  brand: "Studio7",
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
    expect(out.summary).toEqual({ branches: 2, positions: 3, openings: 3, shortRows: 2, over: 2 });
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
