/**
 * แปลงไฟล์ "Quota Branch" จาก HR เป็นข้อมูลพร้อมนำเข้า Google Sheet
 *
 *   pnpm quota:import "Quota Branch 11 Nov 2026.xlsx" [--date=2026-11-11] [--out=ไฟล์ผลลัพธ์.xlsx]
 *
 * ได้ไฟล์ .xlsx 4 แท็บ หัวคอลัมน์ตรงกับ Sheet ของระบบ:
 *   Branches        ทุกสาขาในไฟล์ (ภาค/จังหวัด/BU ตามไฟล์, ร้านที่ชื่อลงท้าย "(ปิด…)" เป็น Closed พร้อมวันปิด)
 *   Positions       ทุกตำแหน่ง พร้อมรหัสจากชีต Quota01_Summary
 *   Quota           โควต้าและคนปัจจุบันของทุกสาขา × ตำแหน่ง (วางทับแท็บ Quota ทั้งแท็บทุกครั้งที่ import)
 *   Import_Initial  1 แถวต่อ 1 อัตราที่ขาด (สถานะ Vacancy, วันที่แจ้งสรรหา = วันที่ของรายงาน) ไม่รวมร้านที่ปิดแล้ว
 * สคริปต์ไม่เขียนลง Sheet เอง: ตรวจไฟล์แล้วคัดลอกไปวางในแท็บเดียวกันของ Sheet
 */
import { basename, dirname, extname, join } from "node:path";
import ExcelJS from "exceljs";
import { codesFromSummary, convertQuota, reportDateFromName, type QuotaRow } from "../src/lib/import/quota";
import { TABS, type TabName } from "../src/lib/sheets/schema";

type Cell = ExcelJS.CellValue;

function plain(v: Cell): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("result" in v) return plain(v.result as Cell);
  if ("text" in v) return String(v.text);
  return String(v);
}
const str = (v: Cell) => String(plain(v));
const num = (v: Cell) => {
  const p = plain(v);
  const n = typeof p === "number" ? p : Number(String(p).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function sheet(book: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const ws = book.getWorksheet(name);
  if (!ws) throw new Error(`ไม่พบชีต "${name}" ในไฟล์ (มี: ${book.worksheets.map((w) => w.name).join(", ")})`);
  return ws;
}

/** Rows of the "All" sheet, columns found by their header text. */
function readAll(ws: ExcelJS.Worksheet): QuotaRow[] {
  const header = new Map<string, number>();
  ws.getRow(1).eachCell((c, col) => header.set(str(c.value).trim(), col));
  const col = (name: string) => {
    const c = header.get(name);
    if (!c) throw new Error(`ชีต All ไม่มีคอลัมน์ "${name}"`);
    return c;
  };
  const C = { id: col("ID"), shop: col("Shop"), brand: col("Group เล็ก"), bu: col("Group ใหญ่"), region: col("ภาค"), province: col("จังหวัด"), position: col("Position"), quota: col("Quota"), actual: col("Actual"), vacant: col("Vacant") };
  const rows: QuotaRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const id = plain(row.getCell(C.id).value);
    if (id === "") continue;
    rows.push({
      id: typeof id === "number" ? String(Math.trunc(id)) : String(id).trim(),
      shop: str(row.getCell(C.shop).value),
      brand: str(row.getCell(C.brand).value),
      bu: str(row.getCell(C.bu).value),
      region: str(row.getCell(C.region).value),
      province: str(row.getCell(C.province).value),
      position: str(row.getCell(C.position).value),
      quota: num(row.getCell(C.quota).value),
      actual: num(row.getCell(C.actual).value),
      vacant: num(row.getCell(C.vacant).value),
    });
  }
  return rows;
}

/** Code and name columns of the summary report, located by their header cells. */
function readSummary(ws: ExcelJS.Worksheet) {
  let codeCol = 0;
  let nameCol = 0;
  ws.eachRow((row) => {
    if (codeCol) return;
    row.eachCell((c, col) => {
      const t = str(c.value).trim();
      if (t === "รหัสตำแหน่ง") codeCol = col;
      if (t === "ชื่อตำแหน่งงาน") nameCol = col;
    });
  });
  if (!codeCol || !nameCol) throw new Error('ชีต Quota01_Summary ไม่มีหัว "รหัสตำแหน่ง" / "ชื่อตำแหน่งงาน"');
  const lines: { code: string; name: string }[] = [];
  ws.eachRow((row) => lines.push({ code: str(row.getCell(codeCol).value), name: str(row.getCell(nameCol).value) }));
  return codesFromSummary(lines);
}

function addTab(book: ExcelJS.Workbook, tab: TabName, rows: object[]) {
  const ws = book.addWorksheet(tab);
  const columns = TABS[tab].columns;
  ws.addRow(columns.map((c) => c.key)).font = { bold: true };
  for (const obj of rows) {
    const rec = obj as Record<string, unknown>;
    ws.addRow(
      columns.map((c) => {
        const v = rec[c.key];
        if (v === null || v === undefined) return "";
        // Real dates, so they stay dates when pasted into Google Sheets.
        if (c.type === "date" && typeof v === "string" && v) return new Date(`${v}T00:00:00Z`);
        return v as string | number | boolean;
      }),
    );
  }
  columns.forEach((c, i) => {
    const column = ws.getColumn(i + 1);
    column.width = Math.max(12, c.key.length + 2);
    if (c.type === "date") column.numFmt = "dd/mm/yyyy";
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

const started = Date.now();
/** Progress line with elapsed seconds, so a slow step is visible instead of looking stuck. */
const log = (msg: string) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)} วิ] ${msg}`);

async function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--"));
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  if (!input) throw new Error('ระบุไฟล์: pnpm quota:import "Quota Branch 11 Nov 2026.xlsx"');
  if (extname(input).toLowerCase() === ".xls") {
    throw new Error("ไฟล์ .xls (Excel รุ่นเก่า) อ่านไม่ได้ — เปิดใน Excel แล้ว File > Save As เป็น .xlsx ก่อน แล้วรันใหม่กับไฟล์ .xlsx");
  }

  const date = opt("date") ?? reportDateFromName(basename(input));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("ระบุวันที่ของรายงานด้วย --date=YYYY-MM-DD (อ่านจากชื่อไฟล์ไม่ได้)");

  log(`กำลังอ่านไฟล์ ${basename(input)} (ไฟล์ใหญ่อาจใช้เวลาครึ่งนาทีถึงหนึ่งนาที)`);
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(input);
  log(`อ่านไฟล์แล้ว: ชีต ${book.worksheets.map((w) => `${w.name} (${w.rowCount} แถว)`).join(", ")}`);
  const summary = readSummary(sheet(book, "Quota01_Summary"));
  const rows = readAll(sheet(book, "All"));
  log(`อ่านโควต้าได้ ${rows.length} บรรทัด, รหัสตำแหน่ง ${summary.codes.size} ตำแหน่ง`);
  const result = convertQuota(rows, summary.codes, date);

  const out = new ExcelJS.Workbook();
  addTab(out, "Branches", result.branches);
  addTab(out, "Positions", result.positions);
  addTab(out, "Import_Initial", result.initial);
  addTab(out, "Quota", result.quota);
  const target = opt("out") ?? join(dirname(input), `${basename(input, extname(input))} - import.xlsx`);
  log("กำลังเขียนไฟล์ผลลัพธ์");
  await out.xlsx.writeFile(target);

  const s = result.summary;
  console.log(`วันที่รายงาน ${date}`);
  console.log(`Branches        ${s.branches} สาขา (ร้านที่ปิดแล้ว ${s.closedBranches})`);
  console.log(`Positions       ${s.positions} ตำแหน่ง`);
  console.log(`Quota           ${result.quota.length} บรรทัด (สาขา × ตำแหน่ง)
Import_Initial  ${s.openings} อัตราที่ขาด (จาก ${s.shortRows} คู่สาขา-ตำแหน่ง) · ตำแหน่งที่เกินโควต้า ${s.over} อัตรา ไม่ถูกนำเข้า · ร้านที่ปิดแล้ว ${s.closedOpenings} อัตรา ไม่ถูกนำเข้า`);
  for (const w of [...summary.warnings, ...result.warnings]) console.warn(`! ${w}`);
  console.log(`บันทึกแล้ว: ${target}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
