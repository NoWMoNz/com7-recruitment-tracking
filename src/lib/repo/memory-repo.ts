import type { TabName } from "@/lib/sheets/schema";
import { NotFoundError, type Dataset, type Repo, type RowOf } from "./types";
import { applyPatch } from "./versioning";

type AnyRow = Record<string, unknown>;

export class MemoryRepo implements Repo {
  private tabs = new Map<TabName, AnyRow[]>();

  constructor(seed: Dataset = {}) {
    for (const [tab, rows] of Object.entries(seed)) {
      this.tabs.set(tab as TabName, structuredClone(rows as unknown as AnyRow[]));
    }
  }

  private rows(tab: TabName): AnyRow[] {
    if (!this.tabs.has(tab)) this.tabs.set(tab, []);
    return this.tabs.get(tab)!;
  }

  async list<T extends TabName>(tab: T): Promise<RowOf<T>[]> {
    return structuredClone(this.rows(tab)) as RowOf<T>[];
  }

  async getFresh<T extends TabName>(tab: T, id: string): Promise<RowOf<T> | null> {
    const row = this.rows(tab).find((r) => r.id === id);
    return row ? (structuredClone(row) as RowOf<T>) : null;
  }

  async append<T extends TabName>(tab: T, rows: RowOf<T>[]): Promise<void> {
    this.rows(tab).push(...structuredClone(rows as unknown as AnyRow[]));
  }

  async update<T extends TabName>(
    tab: T,
    id: string,
    patch: Partial<RowOf<T>>,
    expectedVersion?: number,
  ): Promise<RowOf<T>> {
    const rows = this.rows(tab);
    const i = rows.findIndex((r) => r.id === id);
    if (i === -1) throw new NotFoundError(`ไม่พบ ${id} ในแท็บ ${tab}`);
    const next = applyPatch(tab, rows[i], patch as unknown as AnyRow, expectedVersion);
    rows[i] = next;
    return structuredClone(next) as RowOf<T>;
  }

  async updateMany<T extends TabName>(tab: T, items: { id: string; patch: Partial<RowOf<T>>; expectedVersion?: number }[]): Promise<void> {
    const rows = this.rows(tab);
    const next = items.map(({ id, patch, expectedVersion }) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i === -1) throw new NotFoundError(`ไม่พบ ${id} ในแท็บ ${tab}`);
      return { i, value: applyPatch(tab, rows[i], patch as unknown as AnyRow, expectedVersion) };
    });
    for (const { i, value } of next) rows[i] = value;
  }

  async listNumbered<T extends TabName>(tab: T): Promise<{ rowNumber: number; row: RowOf<T> }[]> {
    return this.rows(tab).map((r, i) => ({ rowNumber: i + 2, row: structuredClone(r) as RowOf<T> }));
  }

  async updateAt<T extends TabName>(tab: T, items: { rowNumber: number; patch: Partial<RowOf<T>> }[]): Promise<void> {
    const rows = this.rows(tab);
    for (const { rowNumber, patch } of items) {
      const i = rowNumber - 2;
      if (!rows[i]) throw new NotFoundError(`ไม่พบแถว ${rowNumber} ในแท็บ ${tab}`);
      rows[i] = { ...rows[i], ...(patch as unknown as AnyRow) };
    }
  }

  async removeAt(tab: TabName, rowNumbers: number[]): Promise<void> {
    const rows = this.rows(tab);
    for (const n of [...rowNumbers].sort((a, b) => b - a)) {
      if (!rows[n - 2]) throw new NotFoundError(`ไม่พบแถว ${n} ในแท็บ ${tab}`);
      rows.splice(n - 2, 1);
    }
  }

  async remove(tab: TabName, id: string): Promise<void> {
    const rows = this.rows(tab);
    const i = rows.findIndex((r) => r.id === id);
    if (i === -1) throw new NotFoundError(`ไม่พบ ${id} ในแท็บ ${tab}`);
    rows.splice(i, 1);
  }

  async invalidate(): Promise<void> {}
}
