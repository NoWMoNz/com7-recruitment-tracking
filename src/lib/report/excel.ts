import "server-only";
import ExcelJS from "exceljs";
import { STATUS_LABEL } from "@/components/status-badge";
import { formatThaiDate } from "@/lib/domain/dates";
import { periodText, wholeMonth, type GroupStat } from "@/lib/domain/report";
import { MANPOWER_STATUS_LABEL, OPEN_MATCH_LABEL, type ManpowerRow } from "@/lib/domain/manpower";
import { RESIGN_STATE_LABEL, type ResignRow } from "@/lib/domain/resign";
import type { HiredRow } from "@/lib/domain/hired";
import type { MasterEntity } from "@/lib/domain/master";
import type { ApprovalRow, HoldRow } from "@/lib/domain/queues";
import type { TrackingRow } from "@/lib/domain/tracking";
import { REVIEW_TYPE_LABEL, type ReviewType } from "@/lib/domain/types";
import { TABS } from "@/lib/sheets/schema";
import type { ReportResult } from "./load";

type Cell = string | number | null;
interface Table {
  sheet: string;
  title: string;
  columns: { header: string; width: number }[];
  rows: Cell[][];
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

/**
 * The shop as HR writes it: "ID 1060_BB_Emquartier_Sukhumvit". The import keeps only the name with spaces
 * (it drops "ID" and turns "_" into spaces), so every space becomes "_" again. A requisition whose shop is
 * gone from Branches carries its code as the name; that is just "ID <code>".
 */
export function exportBranchName(code: string, name: string): string {
  const clean = name.trim().replace(/\s+/g, "_");
  return clean && clean !== code ? `ID ${code}_${clean}` : `ID ${code}`;
}

/** Statuses as the export writes them: as on screen, except "Offer แล้ว", which HR writes as plain "Offer". */
const EXPORT_STATUS_LABEL: Record<keyof typeof STATUS_LABEL, string> = { ...STATUS_LABEL, Offer: "Offer" };

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
            { header: "วันที่ Hired", width: 12 }, { header: "รหัสพนักงาน", width: 13 }, { header: "ชื่อพนักงาน", width: 26 }, { header: "ภาค", width: 14 }, { header: "สาขา", width: 34 },
            { header: "ตำแหน่ง", width: 22 }, { header: "TA", width: 16 }, { header: "AM", width: 16 }, { header: "RM", width: 16 }, { header: "Sourcing Channel", width: 16 }, { header: "วันที่ Offer", width: 12 },
            { header: "วันเริ่มงาน", width: 12 }, { header: "TAT", width: 7 }, { header: "Result", width: 10 },
          ],
          rows: w.hires.map((h) => [formatThaiDate(h.hiredAt), h.employeeId, h.name, h.region, exportBranchName(h.branchCode, h.branchName), h.positionName, h.taName, h.am, h.rm, h.channel, formatThaiDate(h.offerDate), formatThaiDate(h.startDate), h.tat, h.meet ? "Meet" : "Not Meet"]),
        },
        groupTable("ตาม TA", `${title} แยกตาม TA`, "TA", w.groups.taName),
        groupTable("ตาม AM", `${title} แยกตาม AM`, "AM", w.groups.am),
        groupTable("ตาม RM", `${title} แยกตาม RM`, "RM", w.groups.rm),
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
            { header: "วันที่ Turndown", width: 14 }, { header: "ชื่อพนักงาน", width: 26 }, { header: "สาขา", width: 34 }, { header: "ตำแหน่ง", width: 22 }, { header: "TA", width: 16 },
            { header: "วันที่ Offer", width: 12 }, { header: "หลัง Offer (วัน)", width: 15 }, { header: "Sourcing Channel", width: 16 }, { header: "เหตุผล", width: 40 },
          ],
          rows: r.turndowns.rows.map((t) => [formatThaiDate(t.date), t.name, exportBranchName(t.branchCode, t.branchName), t.positionName, t.taName, formatThaiDate(t.offerDate), t.daysAfterOffer, t.channel, t.reason]),
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

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Com7 Recruitment Tracking";
  wb.created = new Date();
  return wb;
}

/** One worksheet: a title row, a bold shaded header row, frozen panes and fixed column widths. */
function writeTable(wb: ExcelJS.Workbook, t: Table) {
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

/** The resignation list as it is on screen (already filtered by the caller). */
export async function buildResignationsWorkbook(rows: ResignRow[]): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const wb = newWorkbook();
  writeTable(wb, {
    sheet: "รายชื่อลาออก",
    title: `รายชื่อลาออก ${rows.length} คน`,
    columns: [
      { header: "รหัสพนักงาน", width: 14 }, { header: "ชื่อพนักงาน", width: 26 }, { header: "BU", width: 14 }, { header: "ภาค", width: 20 }, { header: "สาขา", width: 34 },
      { header: "ตำแหน่ง", width: 24 }, { header: "วันที่มีผล", width: 12 }, { header: "สถานะ", width: 14 }, { header: "สถานะตำแหน่ง", width: 16 },
      { header: "ยกเลิกเมื่อ", width: 12 }, { header: "ยกเลิกโดย", width: 18 }, { header: "เหตุผล", width: 40 }, { header: "AM", width: 16 }, { header: "RM", width: 16 },
    ],
    rows: rows.map((r) => [
      r.employeeId, r.name, r.bu, r.region, exportBranchName(r.branchCode, r.branchName), r.positionName, formatThaiDate(r.effectiveDate), RESIGN_STATE_LABEL[r.state],
      r.reqStatus ? EXPORT_STATUS_LABEL[r.reqStatus] : "-", r.cancelledDay, r.cancelledBy, r.cancelNote, r.am || "-", r.rm || "-",
    ]),
  });
  return { buffer: (await wb.xlsx.writeBuffer()) as ArrayBuffer, filename: "recruitment-resignations.xlsx" };
}

/** HR's quota against actual people, per branch and per position, with the open requisitions in the system beside it. */
type Built = Promise<{ buffer: ArrayBuffer; filename: string }>;

async function oneSheet(t: Table, filename: string): Built {
  const wb = newWorkbook();
  writeTable(wb, t);
  return { buffer: (await wb.xlsx.writeBuffer()) as ArrayBuffer, filename };
}

/** The tracking page as on screen (its filters applied by the caller). */
export function buildTrackingWorkbook(rows: TrackingRow[]): Built {
  return oneSheet(
    {
      sheet: "ติดตามการสรรหา",
      title: `ติดตามการสรรหา ${rows.length} ตำแหน่ง`,
      columns: [
        { header: "รหัสสาขา", width: 10 }, { header: "สาขา", width: 34 }, { header: "BU", width: 12 }, { header: "ภาค", width: 18 }, { header: "จังหวัด", width: 16 },
        { header: "AM", width: 16 }, { header: "RM", width: 16 }, { header: "TA", width: 16 }, { header: "ตำแหน่ง", width: 24 }, { header: "วันที่แจ้งสรรหา", width: 14 },
        { header: "TAT (วัน)", width: 10 }, { header: "Result", width: 10 }, { header: "สถานะ", width: 16 }, { header: "ชื่อพนักงาน", width: 24 },
        { header: "วันที่ Offer", width: 12 }, { header: "วันเริ่มงาน", width: 12 }, { header: "Sourcing Channel", width: 16 },
      ],
      rows: rows.map((r) => [
        r.branchCode, exportBranchName(r.branchCode, r.branchName), r.bu, r.region, r.province || "-", r.am || "-", r.rm || "-", r.taName || "-", r.positionName, formatThaiDate(r.requestDate),
        r.tat, r.offerDate ? (r.tatResult === "Meet" ? "Meet" : "Not Meet") : "-", EXPORT_STATUS_LABEL[r.status], r.offerName ?? "-", formatThaiDate(r.offerDate),
        formatThaiDate(r.offer?.startDate ?? null), r.offerChannel || "-",
      ]),
    },
    "recruitment-tracking.xlsx",
  );
}

export function buildHoldWorkbook(rows: HoldRow[]): Built {
  return oneSheet(
    {
      sheet: "Hold",
      title: `ตำแหน่งที่พักไว้ (Hold) ${rows.length} ตำแหน่ง`,
      columns: [
        { header: "รหัสสาขา", width: 10 }, { header: "สาขา", width: 34 }, { header: "BU", width: 12 }, { header: "ภาค", width: 18 }, { header: "AM", width: 16 },
        { header: "RM", width: 16 }, { header: "TA", width: 16 }, { header: "ตำแหน่ง", width: 24 }, { header: "พักตั้งแต่", width: 12 }, { header: "พักมา (วัน)", width: 11 },
        { header: "TAT ก่อนพัก (วัน)", width: 15 }, { header: "เหตุผล", width: 36 }, { header: "อนุมัติโดย", width: 16 },
      ],
      rows: rows.map((r) => [
        r.branchCode, exportBranchName(r.branchCode, r.branchName), r.bu, r.region, r.am || "-", r.rm || "-", r.taName || "-", r.positionName, formatThaiDate(r.holdSince), r.daysHeld, r.tatAtHold,
        r.reason || "-", r.approvedBy || "-",
      ]),
    },
    "recruitment-hold.xlsx",
  );
}

export function buildApprovalsWorkbook(rows: ApprovalRow[]): Built {
  return oneSheet(
    {
      sheet: "รออนุมัติ",
      title: `คำขอ Cancel / Hold ที่รออนุมัติ ${rows.length} รายการ`,
      columns: [
        { header: "คำขอ", width: 10 }, { header: "รหัสสาขา", width: 10 }, { header: "สาขา", width: 34 }, { header: "ภาค", width: 18 }, { header: "ตำแหน่ง", width: 24 },
        { header: "TA", width: 16 }, { header: "เหตุผล", width: 36 }, { header: "วันที่มีผล", width: 12 }, { header: "ขอโดย", width: 16 }, { header: "ขอเมื่อ", width: 12 },
      ],
      rows: rows.map((r) => [
        r.type === "Cancel" ? "ยกเลิก" : "พัก", r.branchCode, exportBranchName(r.branchCode, r.branchName), r.region, r.positionName, r.taName || "-", r.reason, formatThaiDate(r.effectiveDate),
        r.requestedBy, formatThaiDate(r.requestedAt.slice(0, 10)),
      ]),
    },
    "recruitment-approvals.xlsx",
  );
}

export function buildReviewWorkbook(rows: { id: string; type: ReviewType; detail: string }[]): Built {
  return oneSheet(
    {
      sheet: "รอตรวจ",
      title: `รายการที่ระบบตัดสินเองไม่ได้ ${rows.length} รายการ`,
      columns: [{ header: "เรื่อง", width: 30 }, { header: "รายละเอียด", width: 90 }],
      rows: rows.map((r) => [REVIEW_TYPE_LABEL[r.type] ?? r.type, r.detail]),
    },
    "recruitment-review-queue.xlsx",
  );
}

/** Master data, one sheet per tab with the Sheet's own column names, so it can be read side by side with the Sheet. */
export async function buildMasterWorkbook(tabs: { tab: MasterEntity; rows: object[] }[]): Built {
  const wb = newWorkbook();
  for (const { tab, rows } of tabs) {
    const columns = TABS[tab].columns;
    writeTable(wb, {
      sheet: tab,
      title: `${tab} ${rows.length} แถว`,
      columns: columns.map((c) => ({ header: c.key, width: Math.max(12, c.key.length + 4) })),
      rows: rows.map((obj) => {
        const rec = obj as Record<string, unknown>;
        return columns.map((c) => {
          const v = rec[c.key];
          if (v === null || v === undefined || v === "") return "";
          if (c.type === "date") return formatThaiDate(String(v));
          if (c.type === "bool") return v ? "TRUE" : "FALSE";
          return typeof v === "number" ? v : String(v);
        });
      }),
    });
  }
  return { buffer: (await wb.xlsx.writeBuffer()) as ArrayBuffer, filename: "recruitment-master-data.xlsx" };
}

export async function buildHiredWorkbook(rows: HiredRow[]): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const wb = newWorkbook();
  writeTable(wb, {
    sheet: "Hired",
    title: `Hired ${rows.length} คน`,
    columns: [
      { header: "รหัสพนักงาน", width: 14 }, { header: "ชื่อพนักงาน", width: 26 }, { header: "วันเริ่มงาน", width: 12 }, { header: "ตำแหน่ง", width: 24 },
      { header: "รหัสสาขา", width: 10 }, { header: "สาขา", width: 34 }, { header: "BU", width: 14 }, { header: "ภาค", width: 20 },
      { header: "AM", width: 16 }, { header: "RM", width: 16 }, { header: "TA", width: 18 }, { header: "วันที่ Offer", width: 12 },
      { header: "TAT (วัน)", width: 10 }, { header: "Result", width: 10 }, { header: "Sourcing Channel", width: 18 },
    ],
    rows: rows.map((r) => [
      r.employeeId, r.name, formatThaiDate(r.startDate), r.positionName, r.branchCode, exportBranchName(r.branchCode, r.branchName), r.bu, r.region,
      r.am || "-", r.rm || "-", r.taName || "-", formatThaiDate(r.offerDate), r.tat, r.tatResult === "Meet" ? "Meet" : "Not Meet", r.channel || "-",
    ]),
  });
  return { buffer: (await wb.xlsx.writeBuffer()) as ArrayBuffer, filename: "recruitment-hired.xlsx" };
}

export async function buildManpowerWorkbook(rows: ManpowerRow[]): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const wb = newWorkbook();
  const place = (r: ManpowerRow): Cell[] => [r.bu, r.region, exportBranchName(r.branchCode, r.branchName)];
  // Appended at the end so the columns people already know keep their place.
  const people = (r: ManpowerRow): Cell[] => [r.am || "-", r.rm || "-", r.taName || "-"];
  const peopleCols = [{ header: "AM", width: 16 }, { header: "RM", width: 16 }, { header: "TA", width: 16 }];
  writeTable(wb, {
    sheet: "รายสาขา",
    title: `กำลังพลรายสาขา ${rows.length} สาขา`,
    columns: [
      { header: "BU", width: 14 }, { header: "ภาค", width: 20 }, { header: "สาขา", width: 34 },
      { header: "Quota", width: 9 }, { header: "Actual (HR)", width: 12 }, { header: "Offer แล้ว", width: 11 }, { header: "Actual รวม Offer", width: 16 },
      { header: "ขาด", width: 8 }, { header: "เกิน", width: 8 }, { header: "สถานะ", width: 10 },
      { header: "เปิดสรรหาในระบบ", width: 17 }, { header: "เทียบกับระบบ", width: 14 }, ...peopleCols,
    ],
    rows: rows.map((r) => [...place(r), r.quota, r.hrActual, r.offers, r.actual, r.short, r.over, MANPOWER_STATUS_LABEL[r.status], r.open, OPEN_MATCH_LABEL[r.match], ...people(r)]),
  });
  writeTable(wb, {
    sheet: "รายตำแหน่ง",
    title: "กำลังพลรายตำแหน่ง",
    columns: [
      { header: "BU", width: 14 }, { header: "ภาค", width: 20 }, { header: "สาขา", width: 34 },
      { header: "ตำแหน่ง", width: 28 }, { header: "Quota", width: 9 }, { header: "Actual (HR)", width: 12 }, { header: "Offer แล้ว", width: 11 }, { header: "Actual รวม Offer", width: 16 },
      { header: "ขาด", width: 8 }, { header: "เกิน", width: 8 },
      { header: "เปิดสรรหาในระบบ", width: 17 }, { header: "เทียบกับระบบ", width: 14 }, ...peopleCols,
    ],
    rows: rows.flatMap((r) => r.positions.map((p) => [...place(r), p.positionName, p.quota, p.hrActual, p.offers, p.actual, p.short, p.over, p.open, OPEN_MATCH_LABEL[p.match], ...people(r)])),
  });
  return { buffer: (await wb.xlsx.writeBuffer()) as ArrayBuffer, filename: "recruitment-manpower.xlsx" };
}

/** One worksheet per table: a title row, a bold header row, frozen panes and fixed column widths. */
export async function buildWorkbook(r: ReportResult): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const wb = newWorkbook();
  for (const t of tablesFor(r)) writeTable(wb, t);
  // File name: "all" for everything, the month when the range is one, otherwise from_to.
  const { range } = r.params;
  const stamp = range.all ? "all" : (wholeMonth(range) ?? `${range.first}_${range.last}`);
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, filename: `recruitment-${r.params.tab}-${stamp}.xlsx` };
}
