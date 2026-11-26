import { findRowNumberById, objectToRow, rowsToObjects } from "@/lib/sheets/rows";
import { TABS, type TabName } from "@/lib/sheets/schema";
import { MissingColumnError, MissingTabError, NotFoundError, type Repo, type RowOf } from "./types";
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
  clear(params: { spreadsheetId: string; range: string }): Promise<unknown>;
  batchUpdate(params: {
    spreadsheetId: string;
    requestBody: { valueInputOption: string; data: { range: string; values: unknown[][] }[] };
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
      requestBody: { values: rows.map((r) => objectToRow(TABS[tab], header, r as unknown as AnyRow)) },
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
    const current = this.parse(tab, [values[0], values[rowNum - 1]])[0] as unknown as AnyRow;
    this.assertPatchColumns(tab, header, patch as unknown as AnyRow);
    const next = applyPatch(tab, current, patch as unknown as AnyRow, expectedVersion);
    await this.opts.api.update({
      spreadsheetId: this.opts.sheetId,
      range: `${tab}!A${rowNum}`,
      valueInputOption: "RAW",
      requestBody: { values: [objectToRow(TABS[tab], header, next)] },
    });
    await this.invalidate(tab);
    return next as RowOf<T>;
  }

  private async writeRows(tab: TabName, writes: { rowNumber: number; values: unknown[] }[]): Promise<void> {
    if (writes.length === 0) return;
    await this.opts.api.batchUpdate({
      spreadsheetId: this.opts.sheetId,
      requestBody: { valueInputOption: "RAW", data: writes.map((w) => ({ range: `${tab}!A${w.rowNumber}`, values: [w.values] })) },
    });
    await this.invalidate(tab);
  }

  async updateMany<T extends TabName>(tab: T, items: { id: string; patch: Partial<RowOf<T>>; expectedVersion?: number }[]): Promise<void> {
    if (items.length === 0) return;
    const values = await this.fresh(tab);
    const header = values[0].map((h) => String(h).trim());
    // Build (and version-check) every row before writing any of them.
    const writes = items.map(({ id, patch, expectedVersion }) => {
      const rowNumber = this.locate(tab, values, id);
      if (rowNumber === null) throw new NotFoundError(`ไม่พบ ${id} ในแท็บ ${tab}`);
      const current = this.parse(tab, [values[0], values[rowNumber - 1]])[0] as unknown as AnyRow;
      this.assertPatchColumns(tab, header, patch as unknown as AnyRow);
      const next = applyPatch(tab, current, patch as unknown as AnyRow, expectedVersion);
      return { rowNumber, values: objectToRow(TABS[tab], header, next) };
    });
    await this.writeRows(tab, writes);
  }

  async listNumbered<T extends TabName>(tab: T, opts?: { cached?: boolean }): Promise<{ rowNumber: number; row: RowOf<T> }[]> {
    const values = opts?.cached && this.opts.readCached ? await this.opts.readCached(tab) : await this.fresh(tab);
    const out: { rowNumber: number; row: RowOf<T> }[] = [];
    for (let i = 1; i < values.length; i++) {
      const [row] = this.parse(tab, [values[0], values[i]]);
      if (row) out.push({ rowNumber: i + 1, row });
    }
    return out;
  }

  /** Columns of the spec that a patch names but the sheet's header does not have: writing them would silently drop them. */
  private assertPatchColumns(tab: TabName, header: string[], patch: AnyRow): void {
    const known = new Set(TABS[tab].columns.map((c) => c.key));
    const missing = Object.keys(patch).filter((k) => patch[k] !== undefined && known.has(k) && !header.includes(k));
    if (missing.length) throw new MissingColumnError(tab, missing);
  }

  async requireColumns(tab: TabName, columns: string[]): Promise<void> {
    const values = await this.fresh(tab).catch((e: unknown) => {
      // Google answers "Unable to parse range: Logins!…" when the tab does not exist.
      if (e instanceof Error && /unable to parse range/i.test(e.message)) throw new MissingTabError(tab);
      throw e;
    });
    const header = (values[0] ?? []).map((h) => String(h).trim());
    const missing = columns.filter((c) => !header.includes(c));
    if (missing.length) throw new MissingColumnError(tab, missing);
  }

  async updateAt<T extends TabName>(tab: T, items: { rowNumber: number; patch: Partial<RowOf<T>> }[]): Promise<void> {
    if (items.length === 0) return;
    const values = await this.fresh(tab);
    const header = values[0].map((h) => String(h).trim());
    const writes = items.map(({ rowNumber, patch }) => {
      this.assertPatchColumns(tab, header, patch as unknown as AnyRow);
      const [current] = this.parse(tab, [values[0], values[rowNumber - 1] ?? []]);
      if (!current) throw new NotFoundError(`ไม่พบแถว ${rowNumber} ในแท็บ ${tab}`);
      return { rowNumber, values: objectToRow(TABS[tab], header, { ...(current as unknown as AnyRow), ...(patch as unknown as AnyRow) }) };
    });
    await this.writeRows(tab, writes);
  }

  async removeAt(tab: TabName, rowNumbers: number[]): Promise<void> {
    for (const n of rowNumbers) await this.opts.api.clear({ spreadsheetId: this.opts.sheetId, range: `${tab}!A${n}:${n}` });
    if (rowNumbers.length) await this.invalidate(tab);
  }

  async remove(tab: TabName, id: string): Promise<void> {
    const values = await this.fresh(tab);
    const rowNum = this.locate(tab, values, id);
    if (rowNum === null) throw new NotFoundError(`ไม่พบ ${id} ในแท็บ ${tab}`);
    // Blank the row instead of deleting it so other rows keep their row numbers; blank rows are skipped on read.
    await this.opts.api.clear({ spreadsheetId: this.opts.sheetId, range: `${tab}!A${rowNum}:${rowNum}` });
    await this.invalidate(tab);
  }

  async invalidate(tab: TabName): Promise<void> {
    await this.opts.invalidate?.(tab);
  }
}
