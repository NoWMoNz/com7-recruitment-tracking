/**
 * อัปเดตแท็บ Branches จากไฟล์ฐานข้อมูลร้านของ HR (Zone TA): ชื่อเต็ม, AM, RM และ TA ของแต่ละร้าน
 *
 *   pnpm zone:import "Zone TA Nov.xlsx"            ดูผลก่อน (ไม่เขียนอะไร)
 *   pnpm zone:import "Zone TA Nov.xlsx" --write    เขียนลง Sheet (สำรองแท็บ Branches ไว้ในโฟลเดอร์ backups ก่อน)
 *
 * ไฟล์ต้องมีหัวคอลัมน์ ID, Name, RM, AM, TA ในแถวแรก. อัปเดตเฉพาะร้านที่มีอยู่แล้วในแท็บ Branches;
 * ช่องที่ว่างหรือเป็น #N/A ในไฟล์จะไม่ลบค่าที่มีอยู่. ร้านที่ไม่มีในแท็บ Branches จะไม่ถูกเพิ่ม (แสดงรายการให้ดู).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { applyZoneToBranches, shopsFromZoneTa, type ZoneTaRow } from "../src/lib/import/zone-ta";
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

async function readZone(file: string): Promise<ZoneTaRow[]> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  const ws = book.worksheets[0];
  const header = new Map<string, number>();
  ws.getRow(1).eachCell((c, col) => header.set(plain(c.value).trim().toUpperCase(), col));
  const col = (name: string) => {
    const c = header.get(name.toUpperCase());
    if (!c) throw new Error(`ไฟล์ไม่มีคอลัมน์ "${name}" ในแถวแรก (มี: ${[...header.keys()].join(", ")})`);
    return c;
  };
  const C = { id: col("ID"), name: col("Name"), am: col("AM"), rm: col("RM"), ta: col("TA") };
  const rows: ZoneTaRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (c: number) => plain(row.getCell(c).value);
    rows.push({ id: get(C.id).trim(), name: get(C.name), am: get(C.am), rm: get(C.rm), ta: get(C.ta) });
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const write = args.includes("--write");
  if (!file) throw new Error('ระบุไฟล์ เช่น pnpm zone:import "Zone TA Nov.xlsx"');

  const shops = shopsFromZoneTa(await readZone(file));
  const sheets = createSheetsClient();
  const spreadsheetId = requireEnv("SHEET_ID");
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Branches!A:ZZ", valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
  const before = res.data.values ?? [];
  const result = applyZoneToBranches(before, shops);

  const tas = new Map<string, number>();
  for (const s of shops.values()) if (s.ta) tas.set(s.ta, (tas.get(s.ta) ?? 0) + 1);
  console.log(`ร้านในไฟล์: ${shops.size} · ร้านในแท็บ Branches: ${before.length - 1} แถว`);
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
