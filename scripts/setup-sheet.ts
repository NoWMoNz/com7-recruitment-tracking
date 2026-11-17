/**
 * สร้างโครง Google Sheet: แท็บ หัวคอลัมน์ รูปแบบวันที่ การป้องกันแท็บระบบ และค่า Settings เริ่มต้น
 * รันซ้ำได้ปลอดภัย
 *
 *   pnpm sheet:setup                      # ตั้งค่า Sheet ตาม SHEET_ID
 *   pnpm sheet:setup admin@company.com    # + เพิ่ม super_admin คนแรก ถ้าแท็บ Users ยังว่าง
 */
import { createSheetsClient, requireEnv } from "../src/lib/sheets/google-auth";
import { buildSetupRequests } from "../src/lib/sheets/setup-requests";
import { TABS, type TabName } from "../src/lib/sheets/schema";

const DEFAULT_SETTINGS = [
  ["default_sla_days", "30"],
  ["aging_bands", "30,60,90"],
  ["backdate_days", "3"],
];

async function main() {
  const spreadsheetId = requireEnv("SHEET_ID");
  const adminEmail = process.argv[2]?.trim();
  const sheets = createSheetsClient();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title),protectedRanges(protectedRangeId))",
  });
  const existing = (meta.data.sheets ?? []).map((s) => ({
    title: s.properties?.title ?? "",
    sheetId: s.properties?.sheetId ?? 0,
    protected: (s.protectedRanges?.length ?? 0) > 0,
  }));

  const requests = buildSetupRequests(existing);
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  const created = requests.filter((r) => r.addSheet).map((r) => r.addSheet!.properties!.title);
  console.log(`สร้างแท็บใหม่ ${created.length} แท็บ${created.length ? `: ${created.join(", ")}` : ""}`);

  const tabs = Object.keys(TABS) as TabName[];
  const headers = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: tabs.map((t) => `${t}!1:1`) });
  const missingHeader = tabs.filter((_, i) => !(headers.data.valueRanges?.[i]?.values?.[0]?.length));
  if (missingHeader.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: missingHeader.map((t) => ({ range: `${t}!A1`, values: [TABS[t].columns.map((c) => c.key)] })),
      },
    });
  }
  console.log(`เขียนหัวคอลัมน์ ${missingHeader.length} แท็บ`);

  const settings = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Settings!A2:B" });
  if (!settings.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Settings!A2",
      valueInputOption: "RAW",
      requestBody: { values: DEFAULT_SETTINGS },
    });
    console.log("ใส่ค่า Settings เริ่มต้นแล้ว");
  }

  if (adminEmail) {
    const users = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Users!A2:A" });
    if (!users.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Users!A2",
        valueInputOption: "RAW",
        requestBody: { values: [[adminEmail, "Admin", "super_admin", "", true]] },
      });
      console.log(`เพิ่ม ${adminEmail} เป็น super_admin แล้ว`);
    } else {
      console.log("แท็บ Users มีข้อมูลอยู่แล้ว ไม่ได้เพิ่ม admin");
    }
  }

  console.log("เสร็จ ✔");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
