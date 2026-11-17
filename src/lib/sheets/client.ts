import "server-only";
import { google, type sheets_v4 } from "googleapis";
import type { SheetsValuesApi } from "@/lib/repo/sheets-repo";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`ยังไม่ได้ตั้งค่า environment variable ${name}`);
  return v;
}

export function sheetId(): string {
  return requireEnv("SHEET_ID");
}

let client: sheets_v4.Sheets | null = null;

export function sheetsClient(): sheets_v4.Sheets {
  if (!client) {
    const auth = new google.auth.JWT({
      email: requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      key: requireEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    client = google.sheets({ version: "v4", auth });
  }
  return client;
}

export function sheetsValuesApi(): SheetsValuesApi {
  return sheetsClient().spreadsheets.values as unknown as SheetsValuesApi;
}
