import type { LocalDate } from "./types";

const DAY_MS = 86_400_000;
const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30);
const bangkokFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toUtcMs(d: LocalDate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromUtcMs(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Valid calendar date in UTC arithmetic, or null. */
function buildDate(y: number, m: number, d: number): LocalDate | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2400 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return fromUtcMs(ms);
}

export function todayBangkok(now: Date = new Date()): LocalDate {
  return bangkokFormatter.format(now);
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function addDays(d: LocalDate, n: number): LocalDate {
  return fromUtcMs(toUtcMs(d) + n * DAY_MS);
}

export function formatThaiDate(d: LocalDate | null): string {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/** Accepts dd/mm/yyyy, d/m/yyyy, yyyy-mm-dd. Years above 2400 are Buddhist era (minus 543). */
export function parseUserDate(input: string): LocalDate | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (dmy) {
    [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  } else if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    return null;
  }
  if (y > 2400) y -= 543;
  return buildDate(y, m, d);
}

export function serialToLocalDate(serial: number): LocalDate {
  return fromUtcMs(SERIAL_EPOCH_MS + Math.floor(serial) * DAY_MS);
}

export function localDateToSerial(d: LocalDate): number {
  return Math.round((toUtcMs(d) - SERIAL_EPOCH_MS) / DAY_MS);
}
