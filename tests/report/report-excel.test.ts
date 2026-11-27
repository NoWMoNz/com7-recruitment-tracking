import ExcelJS from "exceljs";
import { describe, expect, test, vi } from "vitest";
import type { ReportResult } from "@/lib/report/load";

vi.mock("server-only", () => ({}));
const { buildWorkbook } = await import("@/lib/report/excel");

describe("report workbook, weekly tab", () => {
  test("the Hired sheet carries AM / RM, and AM / RM get group sheets of their own", async () => {
    const g = [{ key: "ก", hired: 1, avgTat: 20, meetPct: 100 }];
    const r = {
      params: { tab: "weekly", range: { first: "2026-11-01", last: "2026-11-30", all: false } },
      weekly: {
        hires: [{ hiredAt: "2026-11-18", employeeId: "E1", name: "นายก ข", region: "ภาคกลาง", branchCode: "BKK-012", branchName: "ลาดพร้าว", positionName: "Sales", taName: "มายด์", am: "ก", rm: "R", channel: "JobThai", offerDate: "2026-10-20", startDate: null, tat: 20, meet: true }],
        groups: { taName: g, am: g, rm: g, region: g, positionName: g, channel: g },
      },
    } as unknown as ReportResult;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(r)).buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Hired", "ตาม TA", "ตาม AM", "ตาม RM", "ตามภาค", "ตามตำแหน่ง", "ตาม Channel"]);
    const row = (n: number) => (wb.worksheets[0].getRow(n).values as unknown[]).slice(1);
    expect(row(2).slice(6, 9)).toEqual(["TA", "AM", "RM"]);
    expect(row(3).slice(6, 9)).toEqual(["มายด์", "ก", "R"]);
    expect([row(2)[2], row(2)[4]]).toEqual(["ชื่อพนักงาน", "สาขา"]);
    expect(row(3)[4]).toBe("ลาดพร้าว");
  });
});

describe("report workbook, turndown tab", () => {
  test("the name column is ชื่อพนักงาน and the shop is written in full", async () => {
    const r = {
      params: { tab: "turndowns", range: { first: "2026-11-01", last: "2026-11-30", all: false } },
      turndowns: {
        rows: [{ date: "2026-11-10", name: "นางข ค", branchCode: "1060", branchName: "ID 1060_BB_Emquartier_Sukhumvit", positionName: "Sales", taName: "มายด์", offerDate: "2026-11-01", daysAfterOffer: 9, channel: "JobThai", reason: "ได้งานอื่น" }],
      },
    } as unknown as ReportResult;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(r)).buffer);
    const row = (n: number) => (wb.worksheets[0].getRow(n).values as unknown[]).slice(1);
    expect(row(2).slice(0, 3)).toEqual(["วันที่ Turndown", "ชื่อพนักงาน", "สาขา"]);
    expect(row(3).slice(1, 3)).toEqual(["นางข ค", "ID 1060_BB_Emquartier_Sukhumvit"]);
  });
});
