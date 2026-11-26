import ExcelJS from "exceljs";
import { describe, expect, test, vi } from "vitest";
import type { ResignRow } from "@/lib/domain/resign";

vi.mock("server-only", () => ({}));
const { buildResignationsWorkbook } = await import("@/lib/report/excel");

const row = (p: Partial<ResignRow>): ResignRow => ({
  cancelledDay: "", rowNumber: 2, employeeId: "E100", name: "นายก ข", bu: "Apple", region: "ภาคกลาง", province: "กรุงเทพมหานคร", am: "", rm: "", branchCode: "BKK-012", branchName: "ลาดพร้าว",
  positionName: "Sales", effectiveDate: "2026-11-20", state: "resigned", cancelledAt: "", cancelledBy: "", cancelNote: "", reqId: "R1", reqStatus: "Vacancy", reqTaEmail: "", canWithdraw: true, ...p,
});

describe("buildResignationsWorkbook", () => {
  test("one sheet with a title, a header row and one line per resignation", async () => {
    const { buffer, filename } = await buildResignationsWorkbook([
      row({}),
      row({ employeeId: "E200", name: "นางสาวค ง", state: "withdrawn", cancelledAt: "2026-11-18T01:00:00.000Z", cancelledDay: "18/11/2026", cancelledBy: "มายด์", cancelNote: "อยู่ต่อ", reqStatus: "Cancel" }),
    ]);
    expect(filename).toBe("recruitment-resignations.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["รายชื่อลาออก"]);
    const ws = wb.worksheets[0];
    const values = (n: number) => (ws.getRow(n).values as unknown[]).slice(1);
    expect(values(2)).toEqual(["รหัสพนักงาน", "ชื่อพนักงาน", "BU", "ภาค", "สาขา", "ตำแหน่ง", "วันที่มีผล", "สถานะ", "สถานะตำแหน่ง", "ยกเลิกเมื่อ", "ยกเลิกโดย", "เหตุผล", "AM", "RM"]);
    expect(values(3).slice(0, 8)).toEqual(["E100", "นายก ข", "Apple", "ภาคกลาง", "ID BKK-012_ลาดพร้าว", "Sales", "20/11/2026", "ลาออกแล้ว"]);
    expect(values(4)).toEqual(["E200", "นางสาวค ง", "Apple", "ภาคกลาง", "ID BKK-012_ลาดพร้าว", "Sales", "20/11/2026", "ยกเลิกลาออก", "ยกเลิก", "18/11/2026", "มายด์", "อยู่ต่อ", "-", "-"]);
  });

  test("the position's status is the export label: Offer, not Offer แล้ว", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildResignationsWorkbook([row({ reqStatus: "Offer" })])).buffer);
    expect(wb.worksheets[0].getRow(3).getCell(9).value).toBe("Offer");
  });

  test("the withdrawal date column uses cancelledDay, so a hand-typed value cannot crash the export", async () => {
    const { buffer } = await buildResignationsWorkbook([row({ state: "withdrawn", cancelledAt: "ยกเลิก", cancelledDay: "ยกเลิก" })]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets[0].getRow(3).getCell(10).value).toBe("ยกเลิก");
  });

  test("an empty list still produces a sheet that says there is no data", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildResignationsWorkbook([])).buffer);
    expect(wb.worksheets[0].getRow(3).getCell(1).value).toBe("ไม่มีข้อมูล");
  });
});
