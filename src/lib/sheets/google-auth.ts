import { google, type sheets_v4 } from "googleapis";

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`ยังไม่ได้ตั้งค่า environment variable ${name}`);
  return v;
}

/** Sheets API client authenticated as the service account. Usable from Next and from scripts. */
export function createSheetsClient(): sheets_v4.Sheets {
  const auth = new google.auth.JWT({
    email: requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: requireEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}
