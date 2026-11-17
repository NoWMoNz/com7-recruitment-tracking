import "server-only";
import type { sheets_v4 } from "googleapis";
import type { SheetsValuesApi } from "@/lib/repo/sheets-repo";
import { createSheetsClient, requireEnv } from "./google-auth";

export function sheetId(): string {
  return requireEnv("SHEET_ID");
}

let client: sheets_v4.Sheets | null = null;

export function sheetsClient(): sheets_v4.Sheets {
  client ??= createSheetsClient();
  return client;
}

export function sheetsValuesApi(): SheetsValuesApi {
  return sheetsClient().spreadsheets.values as unknown as SheetsValuesApi;
}
