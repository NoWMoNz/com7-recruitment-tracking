import type { TabName } from "@/lib/sheets/schema";
import { NotFoundError, type Dataset, type Repo, type RowOf } from "./types";
import { applyPatch } from "./versioning";

type AnyRow = Record<string, unknown>;

export class MemoryRepo implements Repo {
  private tabs = new Map<TabName, AnyRow[]>();

  constructor(seed: Dataset = {}) {
    for (const [tab, rows] of Object.entries(seed)) {
      this.tabs.set(tab as TabName, structuredClone(rows as AnyRow[]));
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
    this.rows(tab).push(...structuredClone(rows as AnyRow[]));
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
    const next = applyPatch(tab, rows[i], patch as AnyRow, expectedVersion);
    rows[i] = next;
    return structuredClone(next) as RowOf<T>;
  }

  async invalidate(): Promise<void> {}
}
