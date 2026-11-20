import "server-only";
import ExcelJS from "exceljs";
import { formatThaiDate } from "@/lib/domain/dates";
import { periodText, wholeMonth, type GroupStat } from "@/lib/domain/report";
import type { ReportResult } from "./load";

type Cell = string | number | null;
interface Table {
  sheet: string;
  title: string;
  columns: { header: string; width: number }[];
  rows: Cell[][];
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

function monthlyTable(r: ReportResult): Table {
  const m = r.monthly;
  const line = (x: (typeof m.rows)[number]): Cell[] => [x.taName, x.region, x.carriedIn, x.new, x.total, x.closed, x.cancel, x.hold, x.offerPending, x.remaining, x.tatMeet, x.tatTotal, pct(x.tatMeet, x.tatTotal)];
  return {
    sheet: "รายเดือน",
    title: `รายงาน ${periodText(r.params.range)}${m.source.kind === "snapshot" ? " (ปิดงวดแล้ว)" : ""}`,
    columns: [
      { header: "TA", width: 22 }, { header: "ภาค", width: 22 }, { header: "ยกมา", width: 9 }, { header: "เข้าใหม่", width: 9 }, { header: "ถือทั้งหมด", width: 11 },
      { header: "ปิดได้", width: 9 }, { header: "Cancel", width: 9 }, { header: "Hold", width: 9 }, { header: "Offer ค้าง", width: 11 }, { header: "คงเหลือ", width: 9 },
      { header: "TAT Meet", width: 10 }, { header: "Offer ทั้งหมด", width: 13 }, { header: "Meet %", width: 9 },
    ],
    rows: [...m.rows.map(line), line({ ...m.total, taName: "รวม", region: "" })],
  };
}

function groupTable(sheet: string, title: string, label: string, groups: GroupStat[]): Table {
  return {
    sheet,
    title,
    columns: [{ header: label, width: 26 }, { header: "Hired", width: 9 }, { header: "TAT เฉลี่ย (วัน)", width: 16 }, { header: "Meet %", width: 9 }],
    rows: groups.map((g) => [g.key, g.hired, g.avgTat, g.meetPct]),
  };
}

function tablesFor(r: ReportResult): Table[] {
  switch (r.params.tab) {
    case "monthly":
      return [monthlyTable(r)];
    case "weekly": {
      const w = r.weekly;
      const title = `Hired ${periodText(r.params.range)}`;
      return [
        {
          sheet: "Hired",
          title,
          columns: [
            { header: "วันที่ Hired", width: 12 }, { header: "รหัสพนักงาน", width: 13 }, { header: "ชื่อ", width: 26 }, { header: "ภาค", width: 14 }, { header: "สาขา", width: 26 },
            { header: "ตำแหน่ง", width: 22 }, { header: "TA", width: 16 }, { header: "Sourcing Channel", width: 16 }, { header: "วันที่ Offer", width: 12 },
            { header: "วันเริ่มงาน", width: 12 }, { header: "TAT", width: 7 }, { header: "ผล TAT", width: 10 },
          ],
          rows: w.hires.map((h) => [formatThaiDate(h.hiredAt), h.employeeId, h.name, h.region, h.branchName, h.positionName, h.taName, h.channel, formatThaiDate(h.offerDate), formatThaiDate(h.startDate), h.tat, h.meet ? "Meet" : "Not Meet"]),
        },
        groupTable("ตาม TA", `${title} แยกตาม TA`, "TA", w.groups.taName),
        groupTable("ตามภาค", `${title} แยกตามภาค`, "ภาค", w.groups.region),
        groupTable("ตามตำแหน่ง", `${title} แยกตามตำแหน่ง`, "ตำแหน่ง", w.groups.positionName),
        groupTable("ตาม Channel", `${title} แยกตาม Sourcing Channel`, "Sourcing Channel", w.groups.channel),
      ];
    }
    case "turndowns":
      return [
        {
          sheet: "Turndown",
          title: `Turndown ${periodText(r.params.range)}`,
          columns: [
            { header: "วันที่ Turndown", width: 14 }, { header: "ชื่อ", width: 26 }, { header: "สาขา", width: 26 }, { header: "ตำแหน่ง", width: 22 }, { header: "TA", width: 16 },
            { header: "วันที่ Offer", width: 12 }, { header: "หลัง Offer (วัน)", width: 15 }, { header: "Sourcing Channel", width: 16 }, { header: "เหตุผล", width: 40 },
          ],
          rows: r.turndowns.rows.map((t) => [formatThaiDate(t.date), t.name, t.branchName, t.positionName, t.taName, formatThaiDate(t.offerDate), t.daysAfterOffer, t.channel, t.reason]),
        },
      ];
    case "history":
      return [
        {
          sheet: "ประวัติ",
          title: "ประวัติการเปลี่ยนสถานะ",
          columns: [
            { header: "รหัส", width: 16 }, { header: "ตำแหน่ง · สาขา", width: 36 }, { header: "วันที่มีผล", width: 12 }, { header: "จาก", width: 14 },
            { header: "เป็น", width: 14 }, { header: "โดย", width: 16 }, { header: "หมายเหตุ", width: 40 },
          ],
          rows: r.history.items.flatMap((i) => i.entries.map((e) => [i.id, i.title, formatThaiDate(e.date), e.from || "-", e.to === "OwnerChange" ? "เปลี่ยนเจ้าของ" : e.to === "RequestDateChange" ? "แก้วันที่แจ้งสรรหา" : e.to, e.actor, e.note])),
        },
      ];
  }
}

/** One worksheet per table: a title row, a bold header row, frozen panes and fixed column widths. */
export async function buildWorkbook(r: ReportResult): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Com7 Recruitment Tracking";
  wb.created = new Date();
  for (const t of tablesFor(r)) {
    const ws = wb.addWorksheet(t.sheet, { views: [{ state: "frozen", ySplit: 2 }] });
    ws.columns = t.columns.map((c) => ({ width: c.width }));
    ws.addRow([t.title]).font = { bold: true, size: 13 };
    const header = ws.addRow(t.columns.map((c) => c.header));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF0E9" } };
    });
    for (const row of t.rows) ws.addRow(row);
    if (t.rows.length === 0) ws.addRow(["ไม่มีข้อมูล"]);
  }
  // File name: "all" for everything, the month when the range is one, otherwise from_to.
  const { range } = r.params;
  const stamp = range.all ? "all" : (wholeMonth(range) ?? `${range.first}_${range.last}`);
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, filename: `recruitment-${r.params.tab}-${stamp}.xlsx` };
}
