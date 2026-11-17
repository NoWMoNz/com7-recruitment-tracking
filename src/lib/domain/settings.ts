import type { Position, SettingRow } from "./types";

export interface AppSettings {
  defaultSlaDays: number;
  agingBands: [number, number, number];
  backdateDays: number;
}

const DEFAULTS: AppSettings = { defaultSlaDays: 30, agingBands: [30, 60, 90], backdateDays: 3 };

function nonNegativeInt(v: string | undefined): number | null {
  if (v === undefined || !/^\s*\d+\s*$/.test(v)) return null;
  return Number(v);
}

function parseBands(v: string | undefined): [number, number, number] | null {
  if (!v) return null;
  const parts = v.split(",").map((p) => nonNegativeInt(p));
  if (parts.length !== 3 || parts.some((p) => p === null)) return null;
  const [a, b, c] = parts as number[];
  return a < b && b < c ? [a, b, c] : null;
}

export function parseSettings(rows: SettingRow[]): AppSettings {
  const map = new Map(rows.map((r) => [r.key.trim(), String(r.value ?? "")]));
  return {
    defaultSlaDays: nonNegativeInt(map.get("default_sla_days")) ?? DEFAULTS.defaultSlaDays,
    agingBands: parseBands(map.get("aging_bands")) ?? DEFAULTS.agingBands,
    backdateDays: nonNegativeInt(map.get("backdate_days")) ?? DEFAULTS.backdateDays,
  };
}

export function slaFor(position: Position | undefined, s: AppSettings): number {
  return position?.sla_days ?? s.defaultSlaDays;
}
