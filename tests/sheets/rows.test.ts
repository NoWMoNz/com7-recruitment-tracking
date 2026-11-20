import { describe, expect, test } from "vitest";
import { findRowNumberById, objectToRow, rowsToObjects } from "@/lib/sheets/rows";
import { TABS, type TabSpec } from "@/lib/sheets/schema";

const spec = {
  name: "Requisitions",
  system: true,
  columns: [
    { key: "id", type: "string" },
    { key: "branch_code", type: "string" },
    { key: "request_date", type: "date" },
    { key: "version", type: "number" },
  ],
} as TabSpec;

type Row = { id: string; branch_code: string; request_date: string | null; version: number | null };

describe("rowsToObjects", () => {
  const values = [
    ["id", "branch_code", "request_date", "version"],
    ["REQ-1", " BKK-012 ", 46297, 3],
    ["", "", "", ""],
    ["REQ-2", "CNX-001", "17/11/2569", "1"],
    ["REQ-3", "CNX-001", "ไม่ทราบ", 1],
  ];

  test("skips blank rows, parses serial and BE text dates, trims strings", () => {
    const { rows } = rowsToObjects<Row>(spec, values);
    expect(rows.map((r) => r.request_date)).toEqual(["2026-10-02", "2026-11-17", null]);
    expect(rows[0].branch_code).toBe("BKK-012");
    expect(rows[1].version).toBe(1);
  });

  test("reports bad cells with the sheet row number", () => {
    const { issues } = rowsToObjects<Row>(spec, values);
    expect(issues).toEqual([expect.objectContaining({ row: 5, column: "request_date" })]);
  });

  test("maps columns by header name, not position", () => {
    const swapped = [["version", "id", "request_date", "branch_code"], [2, "REQ-9", 46343, "X"]];
    expect(rowsToObjects<Row>(spec, swapped).rows[0]).toMatchObject({ id: "REQ-9", version: 2, request_date: "2026-11-17" });
  });

  test("short rows and missing columns get empty defaults", () => {
    const { rows, issues } = rowsToObjects<Row>(spec, [["id", "branch_code"], ["REQ-1"]]);
    expect(rows[0]).toEqual({ id: "REQ-1", branch_code: "", request_date: null, version: null });
    expect(issues).toEqual([]);
  });

  test("empty sheet gives no rows", () => {
    expect(rowsToObjects<Row>(spec, []).rows).toEqual([]);
  });

  test("bool columns accept TRUE/true/1/ใช่", () => {
    const users = TABS.Users;
    const { rows } = rowsToObjects<{ active: boolean }>(users, [
      ["email", "active"], ["a", true], ["b", "TRUE"], ["c", "1"], ["d", "ใช่"], ["e", "FALSE"], ["f", ""],
    ]);
    expect(rows.map((r) => r.active)).toEqual([true, true, true, true, false, false]);
  });
});

describe("objectToRow", () => {
  test("orders by the sheet's actual header and writes dates as serials", () => {
    expect(
      objectToRow(spec, ["version", "id", "request_date", "branch_code"], {
        id: "REQ-9", branch_code: "X", request_date: "2026-11-17", version: 2,
      }),
    ).toEqual([2, "REQ-9", 46343, "X"]);
  });
  test("null becomes empty cell, unknown header column empty", () => {
    expect(objectToRow(spec, ["id", "request_date", "extra"], { id: "R", request_date: null })).toEqual(["R", "", ""]);
  });
});

describe("findRowNumberById", () => {
  test("finds the 1-based row even with blank rows and re-sorting", () => {
    expect(findRowNumberById(["id", "REQ-3", "", "REQ-1", "REQ-2"], "REQ-1")).toBe(4);
  });
  test("null when missing", () => {
    expect(findRowNumberById(["id", "REQ-3"], "REQ-1")).toBeNull();
  });
  test("throws on duplicate id", () => {
    expect(() => findRowNumberById(["id", "REQ-1", "REQ-1"], "REQ-1")).toThrow();
  });
});

describe("TABS", () => {
  test("every system tab except MonthlySnapshots has an id column", () => {
    for (const t of Object.values(TABS)) {
      if (t.system && t.name !== "MonthlySnapshots") expect(t.columns.some((c) => c.key === "id"), t.name).toBe(true);
    }
  });
  test("covers every tab in the spec", () => {
    expect(Object.keys(TABS).sort()).toEqual([
      "Approvals", "Branches", "Import_Initial", "Import_NewEmployee", "Import_Requisition", "Import_Resign",
      "Import_Transfer", "Logins", "MonthlySnapshots", "NewHires", "Offers", "Positions", "Quota", "RecruiterAssignments",
      "Requisitions", "Requisitions_Archive", "ReviewQueue", "Settings", "SourcingChannels", "StatusLog",
      "StatusLog_Archive", "Turndowns", "Users",
    ]);
  });
});

describe("Import_Resign withdrawal columns", () => {
  test("a row from an old sheet without the withdrawal columns reads them as empty", () => {
    const { rows, issues } = rowsToObjects<Record<string, unknown>>(TABS.Import_Resign, [
      ["employee_id", "title", "first_name", "last_name", "branch_code", "position_code", "effective_date", "processed_at"],
      ["E1", "นาย", "ก", "ข", "BKK-012", "SALES", "20/11/2026", "x"],
    ]);
    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({ employee_id: "E1", cancelled_at: "", cancelled_by: "", cancel_note: "" });
  });

  test("the three columns come last, so sheet:setup can append them to an existing sheet", () => {
    expect(TABS.Import_Resign.columns.map((c) => c.key).slice(-3)).toEqual(["cancelled_at", "cancelled_by", "cancel_note"]);
  });
});
