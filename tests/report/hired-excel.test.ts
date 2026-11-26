import ExcelJS from "exceljs";
import { describe, expect, test, vi } from "vitest";
import type { HiredRow } from "@/lib/domain/hired";

vi.mock("server-only", () => ({}));
const { buildHiredWorkbook } = await import("@/lib/report/excel");

const row = (p: Partial<HiredRow>): HiredRow => ({
  id: "H1", reqId: "R1", employeeId: "E1", name: "นายสมชาย ใจดี", startDate: "2026-11-20", hiredAt: "2026-11-18", offerDate: "2026-10-20", tat: 18,
  tatResult: "Meet", channel: "JobThai", positionName: "Sales", branchCode: "BKK-012", branchName: "ลาดพร้าว", bu: "Apple", region: "ภาคกลาง",
  province: "กรุงเทพฯ", am: "ก", rm: "R", taEmail: "mind@example.com", taName: "มายด์", ...p,
});

describe("buildHiredWorkbook", () => {
  test("one sheet, one line per hire with employee ID, start date, AM / RM / TA and Result", async () => {
    const { buffer, filename } = await buildHiredWorkbook([row({}), row({ id: "H2", employeeId: "E2", startDate: null, tatResult: "NotMeet", am: "", rm: "" })]);
    expect(filename).toBe("recruitment-hired.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Hired"]);
    const ws = wb.worksheets[0];
    const values = (n: number) => (ws.getRow(n).values as unknown[]).slice(1);
    expect(values(2)).toEqual(["รหัสพนักงาน", "ชื่อ", "วันเริ่มงาน", "ตำแหน่ง", "รหัสสาขา", "สาขา", "BU", "ภาค", "AM", "RM", "TA", "วันที่ Offer", "TAT (วัน)", "Result", "Sourcing Channel"]);
    expect(values(3)).toEqual(["E1", "นายสมชาย ใจดี", "20/11/2026", "Sales", "BKK-012", "ลาดพร้าว", "Apple", "ภาคกลาง", "ก", "R", "มายด์", "20/10/2026", 18, "Meet", "JobThai"]);
    expect(values(4).slice(0, 3)).toEqual(["E2", "นายสมชาย ใจดี", "-"]);
    expect(values(4).slice(8, 10)).toEqual(["-", "-"]);
    expect(values(4)[13]).toBe("Not Meet");
  });
});
