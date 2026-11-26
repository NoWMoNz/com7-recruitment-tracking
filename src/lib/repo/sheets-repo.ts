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
  /** Several ranges in one request; Google counts it as a single read against the per-minute quota. */
  batchGet(params: {
    spreadsheetId: string;
    ranges: string[];
    valueRenderOption?: string;
    dateTimeRenderOption?: string;
  }): Promise<{ data: { valueRanges?: { values?: unknown[][] | null }[] | null } }>;
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
  /** Cached reader for list(): the values of each tab asked for (sorted, no repeats), in that order. Defaults to a direct read. */
  readCachedMany?: (tabs: TabName[]) => Promise<unknown[][][]>;
  /** Cache invalidation hook; defaults to no-op. */
  invalidate?: (tab: TabName) => Promise<void>;
}

type AnyRow = Record<string, unknown>;

const READ_OPTIONS = { valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" } as const;

/** Whole tabs in one request: one tab is a plain get, several are one batchGet. Either costs one read of the quota. */
export async function fetchTabsValues(api: SheetsValuesApi, sheetId: string, tabs: TabName[]): Promise<unknown[][][]> {
  if (tabs.length === 1) {
    const res = await api.get({ spreadsheetId: sheetId, range: `${tabs[0]}!A:ZZ`, ...READ_OPTIONS });
    return [res.data.values ?? []];
  }
  const res = await api.batchGet({ spreadsheetId: sheetId, ranges: tabs.map((t) => `${t}!A:ZZ`), ...READ_OPTIONS });
  const ranges = res.data.valueRanges ?? [];
  return tabs.map((_, i) => ranges[i]?.values ?? []);
}

interface Waiter {
  resolve: (values: unknown[][]) => void;
  reject: (e: unknown) => void;
}

/**
 * Collects the tabs asked for in the same tick (every page asks for its tabs in one Promise.all) and reads
 * them with one call of `read`. A microtask, not a timer, so prerendering still sees the read as immediate.
 * Google refuses a whole batch that names a tab the sheet lacks, so a refused batch is read again tab by tab
 * and only the caller of the missing tab gets the error. With `shareInFlight`, a tab already being read is
 * not read again by a later batch (used for cached reads: the layout's pieces ask for Users a moment apart).
 */
class TabBatcher {
  private queue = new Map<TabName, Waiter[]>();
  private scheduled = false;
  private inFlight = new Map<TabName, Promise<unknown[][]>>();

  constructor(
    private readonly read: (tabs: TabName[]) => Promise<unknown[][][]>,
    private readonly shareInFlight: boolean,
  ) {}

  load(tab: TabName): Promise<unknown[][]> {
    const running = this.shareInFlight ? this.inFlight.get(tab) : undefined;
    if (running) return running;
    const promise = new Promise<unknown[][]>((resolve, reject) => {
      const waiters = this.queue.get(tab) ?? [];
      waiters.push({ resolve, reject });
      this.queue.set(tab, waiters);
    });
    if (this.shareInFlight && !this.inFlight.has(tab)) {
      this.inFlight.set(tab, promise);
      const clear = () => {
        if (this.inFlight.get(tab) === promise) this.inFlight.delete(tab);
      };
      promise.then(clear, clear);
    }
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => void this.flush());
    }
    return promise;
  }

  /** After a write: later reads of this tab must not join a read that started before it. */
  forget(tab: TabName): void {
    this.inFlight.delete(tab);
  }

  private async flush(): Promise<void> {
    const batch = this.queue;
    this.queue = new Map();
    this.scheduled = false;
    const tabs = [...batch.keys()].sort();
    const settle = (tab: TabName, values: unknown[][] | null, error?: unknown) => {
      for (const w of batch.get(tab) ?? []) {
        if (values) w.resolve(values);
        else w.reject(error);
      }
    };
    try {
      const values = await this.read(tabs);
      tabs.forEach((t, i) => settle(t, values[i] ?? []));
    } catch (e) {
      if (tabs.length === 1 || !(e instanceof Error && /unable to parse range/i.test(e.message))) {
        tabs.forEach((t) => settle(t, null, e));
        return;
      }
      await Promise.all(
        tabs.map((t) =>
          this.read([t]).then(
            ([values]) => settle(t, values ?? []),
            (err: unknown) => settle(t, null, err),
          ),
        ),
      );
    }
  }
}

export class SheetsRepo implements Repo {
  private readonly freshReads: TabBatcher;
  private readonly cachedReads: TabBatcher;

  constructor(private readonly opts: SheetsRepoOptions) {
    const direct = (tabs: TabName[]) => fetchTabsValues(opts.api, opts.sheetId, tabs);
    this.freshReads = new TabBatcher(direct, false);
    this.cachedReads = new TabBatcher(opts.readCachedMany ?? direct, true);
  }

  private fresh(tab: TabName): Promise<unknown[][]> {
    return this.freshReads.load(tab);
  }

  private cached(tab: TabName): Promise<unknown[][]> {
    return this.opts.readCachedMany ? this.cachedReads.load(tab) : this.fresh(tab);
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
    return this.parse(tab, await this.cached(tab));
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
    const values = opts?.cached ? await this.cached(tab) : await this.fresh(tab);
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
    this.cachedReads.forget(tab);
    await this.opts.invalidate?.(tab);
  }
}
