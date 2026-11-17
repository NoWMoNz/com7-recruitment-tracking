import { localDateToSerial, parseUserDate, serialToLocalDate } from "@/lib/domain/dates";
import type { ColType, TabSpec } from "./schema";

export interface ParseIssue {
  row: number;
  column: string;
  value: unknown;
  message: string;
}

const TRUE_VALUES = new Set(["true", "1", "ใช่", "yes", "y"]);

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

type Parsed = { ok: true; value: unknown } | { ok: false; message: string };

function parseCell(type: ColType, v: unknown): Parsed {
  switch (type) {
    case "string":
      return { ok: true, value: isBlank(v) ? "" : String(v).trim() };
    case "bool":
      return { ok: true, value: v === true || (!isBlank(v) && TRUE_VALUES.has(String(v).trim().toLowerCase())) };
    case "number": {
      if (isBlank(v)) return { ok: true, value: null };
      const n = typeof v === "number" ? v : Number(String(v).trim());
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, message: "ไม่ใช่ตัวเลข" };
    }
    case "date": {
      if (isBlank(v)) return { ok: true, value: null };
      if (typeof v === "number") return { ok: true, value: serialToLocalDate(v) };
      const d = parseUserDate(String(v));
      return d ? { ok: true, value: d } : { ok: false, message: "วันที่ไม่ถูกต้อง" };
    }
  }
}

function emptyValue(type: ColType): unknown {
  if (type === "string") return "";
  if (type === "bool") return false;
  return null;
}

/** values[0] is the header row. Columns are matched by header name. Fully blank rows are skipped. */
export function rowsToObjects<T>(spec: TabSpec, values: unknown[][]): { rows: T[]; issues: ParseIssue[] } {
  const rows: T[] = [];
  const issues: ParseIssue[] = [];
  if (values.length === 0) return { rows, issues };

  const header = values[0].map((h) => String(h ?? "").trim());
  const index = new Map(header.map((h, i) => [h, i]));

  for (let r = 1; r < values.length; r++) {
    const raw = values[r] ?? [];
    if (raw.every(isBlank)) continue;
    const obj: Record<string, unknown> = {};
    for (const col of spec.columns) {
      const i = index.get(col.key);
      const cell = i === undefined ? undefined : raw[i];
      const parsed = parseCell(col.type, cell);
      if (parsed.ok) {
        obj[col.key] = parsed.value;
      } else {
        obj[col.key] = emptyValue(col.type);
        issues.push({ row: r + 1, column: col.key, value: cell, message: parsed.message });
      }
    }
    rows.push(obj as T);
  }
  return { rows, issues };
}

/** Builds a row in the order of the sheet's actual header. Dates become serial numbers. */
export function objectToRow(spec: TabSpec, header: string[], obj: Record<string, unknown>): unknown[] {
  const types = new Map(spec.columns.map((c) => [c.key, c.type]));
  return header.map((h) => {
    const key = String(h).trim();
    const v = obj[key];
    if (v === undefined || v === null) return "";
    if (types.get(key) === "date" && typeof v === "string" && v !== "") return localDateToSerial(v);
    return v;
  });
}

/** idColumn[0] is the header. Returns the 1-based sheet row number. */
export function findRowNumberById(idColumn: unknown[], id: string): number | null {
  let found: number | null = null;
  for (let i = 1; i < idColumn.length; i++) {
    if (String(idColumn[i] ?? "").trim() !== id) continue;
    if (found !== null) throw new Error(`Duplicate id "${id}" at rows ${found} and ${i + 1}`);
    found = i + 1;
  }
  return found;
}
