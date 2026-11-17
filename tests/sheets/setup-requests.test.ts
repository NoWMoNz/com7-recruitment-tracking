import { describe, expect, test } from "vitest";
import { buildSetupRequests } from "@/lib/sheets/setup-requests";
import { TABS } from "@/lib/sheets/schema";

type Req = Record<string, any>;
const tabCount = Object.keys(TABS).length;
const kinds = (reqs: Req[], kind: string) => reqs.filter((r) => kind in r);

describe("buildSetupRequests", () => {
  test("empty spreadsheet adds every tab", () => {
    const reqs = buildSetupRequests([]);
    const added = kinds(reqs, "addSheet").map((r) => r.addSheet.properties.title);
    expect(added.sort()).toEqual(Object.keys(TABS).sort());
  });

  test("idempotent: existing protected tabs get no addSheet or new protection", () => {
    const existing = Object.keys(TABS).map((title, i) => ({ title, sheetId: i + 1, protected: TABS[title as keyof typeof TABS].system }));
    const reqs = buildSetupRequests(existing);
    expect(kinds(reqs, "addSheet")).toHaveLength(0);
    expect(kinds(reqs, "addProtectedRange")).toHaveLength(0);
  });

  test("every date column is formatted dd/mm/yyyy", () => {
    const reqs = buildSetupRequests([]);
    const dateCols = Object.values(TABS).reduce((n, t) => n + t.columns.filter((c) => c.type === "date").length, 0);
    const dateFormats = kinds(reqs, "repeatCell").filter(
      (r) => r.repeatCell.cell.userEnteredFormat.numberFormat?.type === "DATE",
    );
    expect(dateFormats).toHaveLength(dateCols);
    expect(dateFormats[0].repeatCell.cell.userEnteredFormat.numberFormat.pattern).toBe("dd/mm/yyyy");
    expect(dateFormats[0].repeatCell.range.startRowIndex).toBe(1);
  });

  test("system tabs get one warning-only protection each", () => {
    const reqs = buildSetupRequests([]);
    const prot = kinds(reqs, "addProtectedRange");
    expect(prot).toHaveLength(Object.values(TABS).filter((t) => t.system).length);
    expect(prot.every((r) => r.addProtectedRange.protectedRange.warningOnly === true)).toBe(true);
  });

  test("header row frozen on every tab", () => {
    const reqs = buildSetupRequests([]);
    const frozen = kinds(reqs, "updateSheetProperties").filter(
      (r) => r.updateSheetProperties.properties.gridProperties.frozenRowCount === 1,
    );
    expect(frozen).toHaveLength(tabCount);
  });

  test("new tabs reference the sheetId they are created with", () => {
    const reqs = buildSetupRequests([{ title: "Users", sheetId: 7, protected: false }]);
    const ids = new Set(kinds(reqs, "addSheet").map((r) => r.addSheet.properties.sheetId));
    expect(ids.has(7)).toBe(false);
    for (const r of kinds(reqs, "addProtectedRange")) {
      expect(ids.has(r.addProtectedRange.protectedRange.range.sheetId)).toBe(true);
    }
  });
});
