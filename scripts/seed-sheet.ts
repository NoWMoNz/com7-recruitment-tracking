/**
 * เขียนข้อมูลตัวอย่าง (fixtures) ลง Sheet ทดสอบ — แทนที่ข้อมูลเดิมในแท็บที่มีตัวอย่าง
 * ป้องกันไว้: จะรันได้เฉพาะเมื่อ SHEET_ID ตรงกับ TEST_SHEET_ID เท่านั้น
 *
 *   pnpm sheet:seed
 */
import { createSheetsClient, requireEnv } from "../src/lib/sheets/google-auth";
import { objectToRow } from "../src/lib/sheets/rows";
import { TABS, type TabName } from "../src/lib/sheets/schema";
import { fixtures } from "../src/lib/repo/fixtures";

async function main() {
  const spreadsheetId = requireEnv("SHEET_ID");
  if (spreadsheetId !== process.env.TEST_SHEET_ID) {
    throw new Error("ปฏิเสธ: SHEET_ID ไม่ตรงกับ TEST_SHEET_ID — สคริปต์นี้ใช้กับ Sheet ทดสอบเท่านั้น");
  }
  const sheets = createSheetsClient();

  for (const [tab, rows] of Object.entries(fixtures) as [TabName, Record<string, unknown>[]][]) {
    const header = TABS[tab].columns.map((c) => c.key);
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A2:ZZ` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [header, ...rows.map((r) => objectToRow(TABS[tab], header, r))] },
    });
    console.log(`${tab}: ${rows.length} แถว`);
  }
  console.log("เสร็จ ✔");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
