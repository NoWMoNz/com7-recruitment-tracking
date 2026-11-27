import ExcelJS from "exceljs";
import { describe, expect, test, vi } from "vitest";
import type { ManpowerRow } from "@/lib/domain/manpower";

vi.mock("server-only", () => ({}));
const { buildManpowerWorkbook } = await import("@/lib/report/excel");

const row = (p: Partial<ManpowerRow>): ManpowerRow => ({
  branchCode: "A", branchName: "สาขา A", bu: "Apple", region: "ภาคกลาง", province: "กรุงเทพฯ", am: "", rm: "", taEmail: "", ta: "", taName: "", quota: 4, hrActual: 0, offers: 1, actual: 1, short: 3, over: 0, open: 1,
  status: "short", match: "fewer",
  positions: [
    { positionCode: "SALES", positionName: "Sales", quota: 3, hrActual: 0, offers: 0, actual: 0, short: 3, over: 0, open: 1, status: "short", match: "fewer" },
    { positionCode: "SM", positionName: "Store Manager", quota: 1, hrActual: 1, offers: 0, actual: 1, short: 0, over: 0, open: 0, status: "full", match: "match" },
  ],
  ...p,
});

const load = async (rows: ManpowerRow[]) => {
  const { buffer, filename } = await buildManpowerWorkbook(rows);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return { wb, filename };
};
const cells = (ws: ExcelJS.Worksheet, n: number) => (ws.getRow(n).values as unknown[]).slice(1);

describe("buildManpowerWorkbook", () => {
  test("a sheet per branch and a sheet per position, with Thai labels", async () => {
    const { wb, filename } = await load([row({}), row({ branchCode: "B", branchName: "สาขา B", status: "over", short: 0, over: 1, quota: 2, actual: 3, open: 0, match: "match", positions: [] })]);
    expect(filename).toBe("recruitment-manpower.xlsx");
    expect(wb.worksheets.map((w) => w.name)).toEqual(["รายสาขา", "รายตำแหน่ง"]);

    const branches = wb.getWorksheet("รายสาขา")!;
    expect(cells(branches, 2)).toEqual(["BU", "ภาค", "สาขา", "Quota", "Actual (HR)", "Offer แล้ว", "Actual รวม Offer", "ขาด", "เกิน", "สถานะ", "เปิดสรรหาในระบบ", "เทียบกับระบบ", "AM", "RM", "TA"]);
    expect(cells(branches, 3)).toEqual(["Apple", "ภาคกลาง", "สาขา A", 4, 0, 1, 1, 3, 0, "ขาด", 1, "เปิดไม่ครบ", "-", "-", "-"]);
    expect(cells(branches, 4).slice(9, 12)).toEqual(["เกิน", 0, "ตรงกัน"]);

    const positions = wb.getWorksheet("รายตำแหน่ง")!;
    expect(cells(positions, 2)).toEqual(["BU", "ภาค", "สาขา", "ตำแหน่ง", "Quota", "Actual (HR)", "Offer แล้ว", "Actual รวม Offer", "ขาด", "เกิน", "เปิดสรรหาในระบบ", "เทียบกับระบบ", "AM", "RM", "TA"]);
    expect(cells(positions, 3).slice(2, 12)).toEqual(["สาขา A", "Sales", 3, 0, 0, 0, 3, 0, 1, "เปิดไม่ครบ"]);
    expect(cells(positions, 4).slice(3, 12)).toEqual(["Store Manager", 1, 1, 0, 1, 0, 0, 0, "ตรงกัน"]);
  });

  test("an empty list still produces both sheets saying there is no data", async () => {
    const { wb } = await load([]);
    expect(wb.getWorksheet("รายสาขา")!.getRow(3).getCell(1).value).toBe("ไม่มีข้อมูล");
    expect(wb.getWorksheet("รายตำแหน่ง")!.getRow(3).getCell(1).value).toBe("ไม่มีข้อมูล");
  });

  test("the full label set: ครบ / เกิน / ขาด and ตรงกัน / เปิดไม่ครบ / เปิดเกิน", async () => {
    const { wb } = await load([
      row({ status: "full", short: 0, over: 0, match: "match", positions: [] }),
      row({ status: "short", match: "more", open: 5, positions: [] }),
    ]);
    const ws = wb.getWorksheet("รายสาขา")!;
    expect([cells(ws, 3)[9], cells(ws, 3)[11], cells(ws, 4)[9], cells(ws, 4)[11]]).toEqual(["ครบ", "ตรงกัน", "ขาด", "เปิดเกิน"]);
  });
});
