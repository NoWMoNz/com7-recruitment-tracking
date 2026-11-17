import { findRowNumberById, objectToRow, rowsToObjects } from "@/lib/sheets/rows";
import { TABS, type TabName } from "@/lib/sheets/schema";
import { NotFoundError, type Repo, type RowOf } from "./types";
import { applyPatch } from "./versioning";

/** The subset of `sheets.spreadsheets.values` this repo uses (injectable for tests). */
export interface SheetsValuesApi {
  get(params: {
    spreadsheetId: string;
    range: string;
    valueRenderOption?: string;
    dateTimeRenderOption?: string;
  }): Promise<{ data: { values?: unknown[][] | null } }>;
  update(params: {
    spreadsheetId: string;
    range: string;
    valueInputOption: string;
    requestBody: { values: unknown[][] };
  }): Promise<unknown>;
  append(params: {
    spreadsheetId: string;
    range: string;
    valueInputOption: string;
    insertDataOption?: string;
    requestBody: { values: unknown[][] };
  }): Promise<unknown>;
}

export interface SheetsRepoOptions {
  api: SheetsValuesApi;
  sheetId: string;
  /** Cached reader for list(); defaults to a direct read. */
  readCached?: (tab: TabName) => Promise<unknown[][]>;
  /** Cache invalidation hook; defaults to no-op. */
  invalidate?: (tab: TabName) => Promise<void>;
}

type AnyRow = Record<string, unknown>;

export async function fetchTabValues(api: SheetsValuesApi, sheetId: string, tab: TabName): Promise<unknown[][]> {
  const res = await api.get({
    spreadsheetId: sheetId,
    range: `${tab}!A:ZZ`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  return res.data.values ?? [];
}

export class SheetsRepo implements Repo {
  constructor(private readonly opts: SheetsRepoOptions) {}

  private fresh(tab: TabName): Promise<unknown[][]> {
    return fetchTabValues(this.opts.api, this.opts.sheetId, tab);
  }

  private parse<T extends TabName>(tab: T, values: unknown[][]): RowOf<T>[] {
    const { rows, issues } = rowsToObjects<RowOf<T>>(TABS[tab], values);
    for (const i of issues) {
      console.warn(`[sheets] ${tab} แถว ${i.row} คอลัมน์ ${i.column}: ${i.message} (${String(i.value)})`);
    }
    return rows;
  }

  private locate(tab: TabName, values: unknown[][], id: string): number | null {
    const header = (values[0] ?? []).map((h) => String(h).trim());
    const idIdx = header.indexOf("id");
    if (idIdx === -1) throw new Error(`แท็บ ${tab} ไม่มีคอลัมน์ id`);
    return findRowNumberById(values.map((r) => r?.[idIdx]), id);
  }

  async list<T extends TabName>(tab: T): Promise<RowOf<T>[]> {
    const values = this.opts.readCached ? await this.opts.readCached(tab) : await this.fresh(tab);
    return this.parse(tab, values);
  }

  async getFresh<T extends TabName>(tab: T, id: string): Promise<RowOf<T> | null> {
    const values = await this.fresh(tab);
    const rowNum = this.locate(tab, values, id);
    if (rowNum === null) return null;
    return this.parse(tab, [values[0], values[rowNum - 1]])[0] ?? null;
  }

  async append<T extends TabName>(tab: T, rows: RowOf<T>[]): Promise<void> {
    const res = await this.opts.api.get({ spreadsheetId: this.opts.sheetId, range: `${tab}!1:1` });
    const header = (res.data.values?.[0] ?? []).map((h) => String(h).trim());
    if (header.length === 0) throw new Error(`แท็บ ${tab} ยังไม่ได้ตั้งค่าหัวคอลัมน์ (รัน pnpm sheet:setup)`);
    if (rows.length === 0) return;
    await this.opts.api.append({
      spreadsheetId: this.opts.sheetId,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows.map((r) => objectToRow(TABS[tab], header, r as AnyRow)) },
    });
    await this.invalidate(tab);
  }

  async update<T extends TabName>(
    tab: T,
    id: string,
    patch: Partial<RowOf<T>>,
    expectedVersion?: number,
  ): Promise<RowOf<T>> {
    const values = await this.fresh(tab);
    const rowNum = this.locate(tab, values, id);
    if (rowNum === null) throw new NotFoundError(`ไม่พบ ${id} ในแท็บ ${tab}`);
    const header = values[0].map((h) => String(h).trim());
    const current = this.parse(tab, [values[0], values[rowNum - 1]])[0] as AnyRow;
    const next = applyPatch(tab, current, patch as AnyRow, expectedVersion);
    await this.opts.api.update({
      spreadsheetId: this.opts.sheetId,
      range: `${tab}!A${rowNum}`,
      valueInputOption: "RAW",
      requestBody: { values: [objectToRow(TABS[tab], header, next)] },
    });
    await this.invalidate(tab);
    return next as RowOf<T>;
  }

  async invalidate(tab: TabName): Promise<void> {
    await this.opts.invalidate?.(tab);
  }
}
