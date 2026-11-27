/**
 * อัปเดตแท็บ Branches: AM, RM และ TA จากไฟล์ Zone TA และชื่อเต็มร้านจากคอลัมน์ Name_ ของชีต Zone ในไฟล์ Quota ของ HR
 *
 *   pnpm zone:import "Zone TA Nov.xlsx" --names="Quota Branch 11 Nov 2026.xlsx"            ดูผลก่อน (ไม่เขียนอะไร)
 *   pnpm zone:import "Zone TA Nov.xlsx" --names="Quota Branch 11 Nov 2026.xlsx" --write    เขียนลง Sheet (สำรองแท็บ Branches ไว้ในโฟลเดอร์ backups ก่อน)
 *
 * ไฟล์ Zone TA ต้องมีหัวคอลัมน์ ID, RM, AM, TA ในแถวแรก; ไฟล์ --names ต้องมีชีต Zone ที่มีคอลัมน์ ID และ Name_
 * (เช่น "ID 105_Studio 7_Central_Khonkaen"; ตัด "(ปิด…)" ท้ายชื่อออก). ไม่ใส่ --names = ไม่แตะชื่อเต็ม.
 * อัปเดตเฉพาะร้านที่มีอยู่แล้วในแท็บ Branches; ช่องที่ว่างหรือเป็น #N/A จะไม่ลบค่าที่มีอยู่.
 * ร้านที่ไม่มีในแท็บ Branches จะไม่ถูกเพิ่ม (แสดงรายการให้ดู).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { applyZoneToBranches, shopNamesFromZone, shopsFromZoneTa, type ZoneTaRow } from "../src/lib/import/zone-ta";
import { createSheetsClient, requireEnv } from "../src/lib/sheets/google-auth";

type Cell = ExcelJS.CellValue;

function plain(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(Math.trunc(v) === v ? v : v);
  if (typeof v === "string" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if ("error" in v) return String(v.error);
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("result" in v) return plain(v.result as Cell);
  if ("text" in v) return String(v.text);
  return String(v);
}

/** Rows of a sheet as text, columns found by their header text in the first row (any case). */
function readColumns<K extends string>(ws: ExcelJS.Worksheet, columns: Record<K, string>): Record<K, string>[] {
  const header = new Map<string, number>();
  ws.getRow(1).eachCell((c, col) => header.set(plain(c.value).trim().toUpperCase(), col));
  const at = Object.fromEntries(
    Object.entries<string>(columns).map(([key, name]) => {
      const c = header.get(name.toUpperCase());
      if (!c) throw new Error(`ชีต "${ws.name}" ไม่มีคอลัมน์ "${name}" ในแถวแรก (มี: ${[...header.keys()].join(", ")})`);
      return [key, c];
    }),
  ) as Record<K, number>;
  const rows: Record<K, string>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    rows.push(Object.fromEntries(Object.entries<number>(at).map(([key, c]) => [key, plain(row.getCell(c).value)])) as Record<K, string>);
  }
  return rows;
}

async function readBook(file: string): Promise<ExcelJS.Workbook> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  return book;
}

async function readZoneTa(file: string): Promise<ZoneTaRow[]> {
  return readColumns((await readBook(file)).worksheets[0], { id: "ID", am: "AM", rm: "RM", ta: "TA" });
}

/** ID and Name_ of the "Zone" sheet in HR's quota file. */
async function readNames(file: string): Promise<Map<string, string>> {
  const book = await readBook(file);
  const ws = book.getWorksheet("Zone");
  if (!ws) throw new Error(`ไฟล์ ${file} ไม่มีชีต "Zone" (มี: ${book.worksheets.map((w) => w.name).join(", ")})`);
  return shopNamesFromZone(readColumns(ws, { id: "ID", name: "Name_" }));
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const write = args.includes("--write");
  const namesFile = args.find((a) => a.startsWith("--names="))?.slice("--names=".length);
  if (!file) throw new Error('ระบุไฟล์ เช่น pnpm zone:import "Zone TA Nov.xlsx" --names="Quota Branch 11 Nov 2026.xlsx"');

  const names = namesFile ? await readNames(namesFile) : new Map<string, string>();
  if (!namesFile) console.log("! ไม่ได้ใส่ --names=ไฟล์ Quota ของ HR: จะไม่อัปเดตชื่อเต็มร้าน");
  else console.log(`ชื่อเต็มร้าน (Name_) จาก ${namesFile}: ${names.size} ร้าน`);
  const shops = shopsFromZoneTa(await readZoneTa(file), names);
  const sheets = createSheetsClient();
  const spreadsheetId = requireEnv("SHEET_ID");
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Branches!A:ZZ", valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
  const before = res.data.values ?? [];
  const result = applyZoneToBranches(before, shops);

  const tas = new Map<string, number>();
  for (const s of shops.values()) if (s.ta) tas.set(s.ta, (tas.get(s.ta) ?? 0) + 1);
  console.log(`ร้านในไฟล์: ${shops.size} · ร้านในแท็บ Branches: ${before.length - 1} แถว`);
  const sample = result.values.find((r) => String(r[0]) === "105");
  if (sample) console.log(`ตัวอย่าง ร้าน 105: ${sample.slice(result.values[0].indexOf("full_name")).join(" · ")}`);
  console.log(`จะอัปเดต: ${result.changed} ร้าน${result.addedColumns.length ? ` · เพิ่มคอลัมน์ ${result.addedColumns.join(", ")}` : ""}`);
  console.log(`TA ในไฟล์: ${[...tas].map(([n, c]) => `${n} (${c})`).join(", ")}`);
  console.log(`ร้านใน Branches ที่ไฟล์ไม่มี (คงเดิม): ${result.notInZone.length}${result.notInZone.length ? ` เช่น ${result.notInZone.slice(0, 10).join(", ")}` : ""}`);
  console.log(`ร้านในไฟล์ที่ Branches ไม่มี (ไม่เพิ่ม): ${result.notInBranches.length}${result.notInBranches.length ? ` เช่น ${result.notInBranches.slice(0, 10).join(", ")}` : ""}`);

  if (!write) {
    console.log("\nยังไม่ได้เขียนอะไร: ใส่ --write เพื่อบันทึกลง Sheet");
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("backups", { recursive: true });
  const backup = join("backups", `Branches-${stamp}.json`);
  writeFileSync(backup, JSON.stringify(before));
  console.log(`\nสำรองแท็บ Branches เดิมไว้ที่ ${backup}`);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Branches!A1",
    valueInputOption: "RAW",
    requestBody: { values: result.values.map((r) => r.map((v) => (v === undefined || v === null ? "" : v))) },
  });
  console.log(`เขียนแท็บ Branches แล้ว (${result.values.length - 1} แถว)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
