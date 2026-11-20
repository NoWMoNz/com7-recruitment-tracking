import type { Position, SettingRow } from "./types";

export interface AppSettings {
  defaultSlaDays: number;
  agingBands: [number, number, number];
  backdateDays: number;
  /** Whether a transfer out also opens a vacancy at the source branch (spec: to be confirmed). */
  transferOutCreatesVacancy: boolean;
}

const DEFAULTS: AppSettings = { defaultSlaDays: 30, agingBands: [30, 60, 90], backdateDays: 3, transferOutCreatesVacancy: true };

function nonNegativeInt(v: string | undefined): number | null {
  if (v === undefined || !/^\s*\d+\s*$/.test(v)) return null;
  return Number(v);
}

function parseFlag(v: string | undefined): boolean | null {
  const s = v?.trim().toLowerCase();
  if (!s) return null;
  if (["1", "true", "yes", "ใช่"].includes(s)) return true;
  if (["0", "false", "no", "ไม่"].includes(s)) return false;
  return null;
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
    transferOutCreatesVacancy: parseFlag(map.get("transfer_out_creates_vacancy")) ?? DEFAULTS.transferOutCreatesVacancy,
  };
}

export function slaFor(position: Position | undefined, s: AppSettings): number {
  return position?.sla_days ?? s.defaultSlaDays;
}
