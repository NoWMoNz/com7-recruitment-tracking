import ExcelJS from "exceljs";
import { describe, expect, test, vi } from "vitest";
import type { ApprovalRow, HoldRow } from "@/lib/domain/queues";
import type { TrackingRow } from "@/lib/domain/tracking";

vi.mock("server-only", () => ({}));
const { buildTrackingWorkbook, buildHoldWorkbook, buildApprovalsWorkbook, buildReviewWorkbook, buildMasterWorkbook } = await import("@/lib/report/excel");

async function sheets(buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => ({ name: ws.name, row: (n: number) => (ws.getRow(n).values as unknown[]).slice(1) }));
}

const place = {
  reqId: "R1", version: 1, region: "ภาคกลาง", province: "กรุงเทพฯ", bu: "Apple", branchCode: "BKK-012", branchName: "ลาดพร้าว",
  positionName: "Sales", requestDate: "2026-10-02", taName: "มายด์", ta: "mind@example.com", am: "ก", rm: "R",
};

describe("page exports", () => {
  test("tracking: one line per position with shop, AM / RM, TAT, Result ('-' before an Offer), status, Offer and start date", async () => {
    const base: TrackingRow = {
      id: "V1", region: "ภาคกลาง", province: "กรุงเทพฯ", bu: "Apple", am: "ก", rm: "R", branchCode: "BKK-012", branchName: "ลาดพร้าว", positionName: "Sales",
      requestDate: "2026-10-02", status: "Vacancy", upcoming: false, tat: 46, tatResult: "NotMeet", agingBand: "orange", taEmail: "mind@example.com", ta: "mind@example.com", taName: "มายด์",
      offerName: null, offerDate: null, offerChannel: null, offer: null, startOverdue: false, holdDays: 0, slaDays: 30, canEdit: true, version: 1,
    };
    const offered: TrackingRow = {
      ...base, id: "O1", status: "Offer", tat: 18, tatResult: "Meet", agingBand: null, offerName: "นายสมชาย ใจดี", offerDate: "2026-10-20", offerChannel: "JobThai",
      offer: { title: "นาย", firstName: "สมชาย", lastName: "ใจดี", phone: "", channel: "JobThai", startDate: "2026-11-01", editableUntil: "" },
    };
    const { buffer, filename } = await buildTrackingWorkbook([base, offered]);
    expect(filename).toBe("recruitment-tracking.xlsx");
    const [s] = await sheets(buffer);
    expect(s.name).toBe("ติดตามการสรรหา");
    expect(s.row(2)).toEqual(["รหัสสาขา", "สาขา", "BU", "ภาค", "จังหวัด", "AM", "RM", "TA", "ตำแหน่ง", "วันที่แจ้งสรรหา", "TAT (วัน)", "Result", "สถานะ", "ชื่อพนักงาน", "วันที่ Offer", "วันเริ่มงาน", "Sourcing Channel"]);
    expect(s.row(3)).toEqual(["BKK-012", "ลาดพร้าว", "Apple", "ภาคกลาง", "กรุงเทพฯ", "ก", "R", "มายด์", "Sales", "02/10/2026", 46, "-", "ว่าง", "-", "-", "-", "-"]);
    expect(s.row(4).slice(10)).toEqual([18, "Meet", "Offer", "นายสมชาย ใจดี", "20/10/2026", "01/11/2026", "JobThai"]);
  });

  test("hold: shop, AM / RM / TA, since when, days held, TAT before the hold and the reason", async () => {
    const hold: HoldRow = { ...place, holdSince: "2026-11-01", daysHeld: 16, tatAtHold: 30, reason: "ปรับปรุงร้าน", approvedBy: "จู", approvedAt: "2026-11-01", canEdit: true };
    const [s] = await sheets((await buildHoldWorkbook([hold])).buffer);
    expect(s.name).toBe("Hold");
    expect(s.row(2)).toEqual(["รหัสสาขา", "สาขา", "BU", "ภาค", "AM", "RM", "TA", "ตำแหน่ง", "พักตั้งแต่", "พักมา (วัน)", "TAT ก่อนพัก (วัน)", "เหตุผล", "อนุมัติโดย"]);
    expect(s.row(3)).toEqual(["BKK-012", "ลาดพร้าว", "Apple", "ภาคกลาง", "ก", "R", "มายด์", "Sales", "01/11/2026", 16, 30, "ปรับปรุงร้าน", "จู"]);
  });

  test("approvals: what is asked, for which position, by whom and since when", async () => {
    const a: ApprovalRow = { ...place, id: "A1", type: "Cancel", reason: "ปิดตำแหน่ง", effectiveDate: "2026-11-15", evidenceRef: "local:x", requestedBy: "มายด์", requestedAt: "2026-11-16T03:00:00.000Z" };
    const [s] = await sheets((await buildApprovalsWorkbook([a])).buffer);
    expect(s.row(2)).toEqual(["คำขอ", "รหัสสาขา", "สาขา", "ภาค", "ตำแหน่ง", "TA", "เหตุผล", "วันที่มีผล", "ขอโดย", "ขอเมื่อ"]);
    expect(s.row(3)).toEqual(["ยกเลิก", "BKK-012", "ลาดพร้าว", "ภาคกลาง", "Sales", "มายด์", "ปิดตำแหน่ง", "15/11/2026", "มายด์", "16/11/2026"]);
  });

  test("review queue: the type in words and the detail", async () => {
    const [s] = await sheets((await buildReviewWorkbook([{ id: "RV1", type: "UnmatchedHire", detail: "นายก ข (E1)" }])).buffer);
    expect(s.row(2)).toEqual(["เรื่อง", "รายละเอียด"]);
    expect(s.row(3)).toEqual(["รอจับคู่พนักงานใหม่", "นายก ข (E1)"]);
  });

  test("master data: one sheet per tab, every column by its Sheet name, dates as dd/mm/yyyy", async () => {
    const out = await sheets(
      (
        await buildMasterWorkbook([
          { tab: "Branches", rows: [{ branch_code: "BKK-012", branch_name: "ลาดพร้าว", brand: "Studio7", bu: "Apple", province: "กรุงเทพฯ", region: "ภาคกลาง", status: "Open", open_date: null, close_date: "2026-12-31", am: "ก", rm: "R" }] },
          { tab: "Users", rows: [{ email: "ju@example.com", name: "จู", role: "super_admin", scope: "", active: true }] },
        ])
      ).buffer,
    );
    expect(out.map((s) => s.name)).toEqual(["Branches", "Users"]);
    expect(out[0].row(2)).toEqual(["branch_code", "branch_name", "brand", "bu", "province", "region", "status", "open_date", "close_date", "am", "rm", "full_name", "ta"]);
    expect(out[0].row(3)).toEqual(["BKK-012", "ลาดพร้าว", "Studio7", "Apple", "กรุงเทพฯ", "ภาคกลาง", "Open", "", "31/12/2026", "ก", "R", "", ""]);
    expect(out[1].row(3)).toEqual(["ju@example.com", "จู", "super_admin", "", "TRUE"]);
  });
});
