import { addDays, daysBetween, formatThaiDate } from "./dates";
import { branchLabel, peopleOfBranch, taOf } from "./people";
import { inScope, normalizeEmail } from "./permissions";
import { slaFor, type AppSettings } from "./settings";
import { computeTat, holdDays } from "./tat";
import { buOf, type Branch, type LocalDate, type MonthlySnapshot, type NewHire, type Offer, type Position, type Requisition, type Status, type StatusLogEntry, type Turndown, type User } from "./types";

/** Statuses that count as "Vacancy คงเหลือ" (open): not closed and not on Hold. */
export const OPEN_STATUSES: readonly Status[] = ["Vacancy", "Offer", "PendingCancel", "PendingHold"];
const STATUSES = new Set<string>(["Vacancy", "Offer", "PendingCancel", "PendingHold", "Hold", "Cancel", "Hired", "Transfer"]);
const CLOSED = new Set<string>(["Cancel", "Hired", "Transfer"]);

export interface ReportData {
  requisitions: Requisition[];
  log: StatusLogEntry[];
  branches: Branch[];
  positions: Position[];
  users: User[];
  settings: AppSettings;
}

export interface ReportFilter {
  /** Business unit (Group ใหญ่). */
  bu?: string;
  region?: string;
  province?: string;
  branch?: string;
  position?: string;
  ta?: string;
  /** Area / Regional Manager name of the branch. */
  am?: string;
  rm?: string;
}

/** "2026-11" -> first and last day. */
export function monthRange(month: string): { first: LocalDate; last: LocalDate } {
  const [y, m] = month.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { first, last: addDays(next, -1) };
}

/** Monday..Sunday week containing `date`. */
export function weekRange(date: LocalDate): { first: LocalDate; last: LocalDate } {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const first = addDays(date, -dow);
  return { first, last: addDays(first, 6) };
}

/** The days a report covers: a from–to range the user picked, or everything on record. */
export interface PeriodRange {
  first: LocalDate;
  last: LocalDate;
  /** Every day on record, so `first`/`last` are only bounds and not worth printing. */
  all: boolean;
}

export const ALL_TIME: PeriodRange = { first: "1970-01-01", last: "2999-12-31", all: true };

/**
 * From/to as given (a reversed pair is put the right way round, one end alone means that single day).
 * `all` wins over dates; nothing at all falls back to `fallback`.
 */
export function periodRange(opts: { from?: LocalDate; to?: LocalDate; all?: boolean }, fallback: { first: LocalDate; last: LocalDate }): PeriodRange {
  if (opts.all) return ALL_TIME;
  const a = opts.from ?? opts.to;
  const b = opts.to ?? opts.from;
  if (!a || !b) return { ...fallback, all: false };
  return a <= b ? { first: a, last: b, all: false } : { first: b, last: a, all: false };
}

/** "2026-11" when the range is exactly one calendar month, which is what a closed-month snapshot can answer. */
export function wholeMonth(r: PeriodRange): string | null {
  if (r.all) return null;
  const m = r.first.slice(0, 7);
  const full = monthRange(m);
  return full.first === r.first && full.last === r.last ? m : null;
}

/** Heading text for a range. */
export function periodText(r: PeriodRange): string {
  if (r.all) return "ทั้งหมด";
  const m = wholeMonth(r);
  if (m) return `เดือน ${m}`;
  return r.first === r.last ? formatThaiDate(r.first) : `${formatThaiDate(r.first)} – ${formatThaiDate(r.last)}`;
}

type LogIndex = Map<string, StatusLogEntry[]>;

const indexCache = new WeakMap<readonly StatusLogEntry[], { length: number; index: LogIndex }>();

/** Status changes per requisition, oldest first. Built once per log array (the dashboard asks for it 70+ times). */
export function indexLog(log: StatusLogEntry[]): LogIndex {
  const hit = indexCache.get(log);
  if (hit && hit.length === log.length) return hit.index;
  const byReq: LogIndex = new Map();
  for (const e of log) {
    if (!STATUSES.has(e.to_status)) continue; // creation rows ("") and OwnerChange don't change status
    if (!byReq.has(e.req_id)) byReq.set(e.req_id, []);
    byReq.get(e.req_id)!.push(e);
  }
  for (const list of byReq.values()) list.sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.at.localeCompare(b.at));
  indexCache.set(log, { length: log.length, index: byReq });
  return byReq;
}

/**
 * Status of a requisition at the end of `date`, rebuilt from StatusLog. null = it didn't exist yet.
 * Rows with no history at all (e.g. created before the log existed) are taken at their current status
 * from the day it was set (closed_at / status_date), Vacancy before that.
 */
export function statusAt(r: Requisition, byReq: LogIndex, date: LocalDate): Status | null {
  if (r.request_date > date) return null;
  const entries = byReq.get(r.id);
  if (!entries?.length) {
    const since = r.closed_at ?? r.status_date ?? r.request_date;
    return since <= date ? r.status : "Vacancy";
  }
  let s: Status = "Vacancy";
  for (const e of entries) {
    if (e.effective_date > date) break;
    s = e.to_status as Status;
  }
  return s;
}

/** Days in [first, last] on which the requisition moved into `to` (from the log, or closed_at for log-less rows). */
function movedInto(r: Requisition, byReq: LogIndex, to: Status, first: LocalDate, last: LocalDate): boolean {
  const entries = byReq.get(r.id);
  if (!entries?.length) return r.status === to && CLOSED.has(to) && !!r.closed_at && r.closed_at >= first && r.closed_at <= last;
  return entries.some((e) => e.to_status === to && e.effective_date >= first && e.effective_date <= last);
}

function lookups(d: ReportData) {
  const branches = new Map(d.branches.map((b) => [b.branch_code, b]));
  const positions = new Map(d.positions.map((p) => [p.position_code, p]));
  const users = new Map(d.users.map((u) => [normalizeEmail(u.email), u]));
  const regionOf = (r: Requisition) => branches.get(r.branch_code)?.region || "ไม่ระบุ";
  const nameOf = (email: string) => (email ? users.get(normalizeEmail(email))?.name || email : "ยังไม่มีเจ้าของ");
  /** The TA a requisition counts under (the shop's TA, else its owner; see taOf). */
  const taFor = (r: Requisition) => {
    const t = taOf(branches.get(r.branch_code), r.ta_email, (e) => users.get(e)?.name);
    return { ta: t.ta, taName: t.taName || "ยังไม่มีเจ้าของ" };
  };
  return { branches, positions, regionOf, nameOf, taFor };
}

/** Requisitions the viewer may see that pass the filter. */
export function filtered(d: ReportData, viewer: User, f: ReportFilter): Requisition[] {
  const { branches, taFor } = lookups(d);
  return d.requisitions.filter((r) => {
    const b = branches.get(r.branch_code);
    if (!inScope(viewer, b ?? { region: "ไม่ระบุ", branch_code: r.branch_code })) return false;
    if (f.bu && buOf(b) !== f.bu) return false;
    if (f.region && (b?.region || "ไม่ระบุ") !== f.region) return false;
    if (f.province && b?.province !== f.province) return false;
    if (f.branch && r.branch_code !== f.branch) return false;
    if (f.position && r.position_code !== f.position) return false;
    if (f.ta && taFor(r).ta !== normalizeEmail(f.ta)) return false;
    if (f.am && peopleOfBranch(b).am !== f.am) return false;
    if (f.rm && peopleOfBranch(b).rm !== f.rm) return false;
    return true;
  });
}

export interface MonthlyRow {
  /** The extra grouping key passed to monthlyRows; "" when none. */
  group?: string;
  /** TA key (see taOf) and name. */
  ta: string;
  taName: string;
  region: string;
  carriedIn: number;
  new: number;
  total: number;
  closed: number;
  cancel: number;
  hold: number;
  offerPending: number;
  remaining: number;
  tatMeet: number;
  tatTotal: number;
  /** Sum of TAT days, and of the SLA days those offers were judged against: their ratio is the average speed against the limit. Not stored in snapshots (0 there). */
  tatDays: number;
  slaDays: number;
}

const zero = (ta: string, taName: string, region: string): MonthlyRow => ({
  ta, taName, region, carriedIn: 0, new: 0, total: 0, closed: 0, cancel: 0, hold: 0, offerPending: 0, remaining: 0, tatMeet: 0, tatTotal: 0, tatDays: 0, slaDays: 0,
});

/**
 * Cut per TA and region over a month ("2026-11") or any from–to range (spec §8). "Carried in" is the day before
 * the range starts; "Remaining" and "Offer pending" are taken at its last day, or today if that has not come yet.
 * TAT Meet counts offers made in the range (also ones later turned down or hired).
 * Credit goes to the shop's TA from HR's database, else the requisition's current owner (owner changes are not tracked yet).
 */
export function monthlyRows(
  d: ReportData & { offers: (Offer | Turndown | NewHire)[] },
  reqs: Requisition[],
  period: string | { first: LocalDate; last: LocalDate },
  today: LocalDate,
  /** Optional extra key to split rows by (e.g. BU|AM|RM), carried on each row as `group`. */
  groupOf?: (r: Requisition) => string,
): MonthlyRow[] {
  const { first, last } = typeof period === "string" ? monthRange(period) : period;
  const end = last < today ? last : today;
  const before = addDays(first, -1);
  const byReq = indexLog(d.log);
  const { positions, regionOf, taFor } = lookups(d);
  const rows = new Map<string, MonthlyRow>();
  const row = (r: Requisition) => {
    const group = groupOf?.(r) ?? "";
    const t = taFor(r);
    const key = `${group}|${t.ta}|${regionOf(r)}`;
    if (!rows.has(key)) rows.set(key, { ...zero(t.ta, t.taName, regionOf(r)), group });
    return rows.get(key)!;
  };
  const open = (s: Status | null) => s !== null && OPEN_STATUSES.includes(s);

  for (const r of reqs) {
    const atEnd = statusAt(r, byReq, end);
    const f = {
      carriedIn: open(statusAt(r, byReq, before)),
      isNew: r.request_date >= first && r.request_date <= end,
      closed: movedInto(r, byReq, "Hired", first, end) || movedInto(r, byReq, "Transfer", first, end),
      cancel: movedInto(r, byReq, "Cancel", first, end),
      hold: movedInto(r, byReq, "Hold", first, end),
      offerPending: atEnd === "Offer",
      remaining: open(atEnd),
    };
    if (!Object.values(f).some(Boolean)) continue;
    const x = row(r);
    x.carriedIn += Number(f.carriedIn);
    x.new += Number(f.isNew);
    x.closed += Number(f.closed);
    x.cancel += Number(f.cancel);
    x.hold += Number(f.hold);
    x.offerPending += Number(f.offerPending);
    x.remaining += Number(f.remaining);
  }

  const reqById = new Map(reqs.map((r) => [r.id, r]));
  const seen = new Set<string>();
  for (const o of d.offers) {
    if (seen.has(o.id) || o.offer_date < first || o.offer_date > end) continue;
    seen.add(o.id);
    const r = reqById.get(o.req_id);
    if (!r) continue;
    const tat = computeTat({ requestDate: r.request_date, endDate: o.offer_date, holdDays: holdDays(d.log, r.id, o.offer_date) });
    const x = row(r);
    const sla = slaFor(positions.get(r.position_code), d.settings);
    x.tatTotal++;
    x.tatDays += tat;
    x.slaDays += sla;
    if (tat <= sla) x.tatMeet++;
  }

  for (const x of rows.values()) x.total = x.carriedIn + x.new;
  return [...rows.values()]
    .filter((x) => x.total + x.closed + x.cancel + x.hold + x.remaining + x.tatTotal > 0)
    .sort((a, b) => a.taName.localeCompare(b.taName, "th") || a.region.localeCompare(b.region, "th"));
}

/** Sums rows (e.g. a TA's regions) into one. */
export function sumRows(rows: MonthlyRow[], ta = "", taName = "รวม", region = ""): MonthlyRow {
  const t = zero(ta, taName, region);
  for (const r of rows) {
    for (const k of ["carriedIn", "new", "total", "closed", "cancel", "hold", "offerPending", "remaining", "tatMeet", "tatTotal", "tatDays", "slaDays"] as const) t[k] += r[k];
  }
  return t;
}

/** One row per TA (regions summed), for display. */
export function byTa(rows: MonthlyRow[]): MonthlyRow[] {
  const groups = new Map<string, MonthlyRow[]>();
  for (const r of rows) groups.set(r.ta, [...(groups.get(r.ta) ?? []), r]);
  return [...groups.values()].map((g) => sumRows(g, g[0].ta, g[0].taName, g.map((r) => r.region).join(", ")));
}

export interface HireRow {
  hiredAt: LocalDate;
  employeeId: string;
  name: string;
  region: string;
  branchCode: string;
  branchName: string;
  positionName: string;
  taName: string;
  /** Area / Regional Manager of the branch, "-" when not set (so they group together). */
  am: string;
  rm: string;
  channel: string;
  offerDate: LocalDate;
  startDate: LocalDate | null;
  tat: number;
  meet: boolean;
}

/** Weekly report: people moved Offer -> Hired with hired_at in [first, last]. */
export function hiresBetween(d: ReportData & { newHires: NewHire[] }, reqs: Requisition[], first: LocalDate, last: LocalDate): HireRow[] {
  const { branches, positions, regionOf, taFor } = lookups(d);
  const reqById = new Map(reqs.map((r) => [r.id, r]));
  return d.newHires
    .filter((h) => h.hired_at >= first && h.hired_at <= last && reqById.has(h.req_id))
    .map((h) => {
      const r = reqById.get(h.req_id)!;
      return {
        hiredAt: h.hired_at,
        employeeId: h.employee_id,
        name: `${h.title}${h.first_name} ${h.last_name}`,
        region: regionOf(r),
        branchCode: r.branch_code,
        branchName: branchLabel(r.branch_code, branches.get(r.branch_code)),
        positionName: positions.get(r.position_code)?.position_name || r.position_code,
        taName: taFor(r).taName,
        am: peopleOfBranch(branches.get(r.branch_code)).am || "-",
        rm: peopleOfBranch(branches.get(r.branch_code)).rm || "-",
        channel: h.sourcing_channel || "-",
        offerDate: h.offer_date,
        startDate: h.start_date,
        tat: h.tat,
        meet: h.tat_result === "Meet",
      };
    })
    .sort((a, b) => a.hiredAt.localeCompare(b.hiredAt) || a.name.localeCompare(b.name, "th"));
}

export interface GroupStat {
  key: string;
  hired: number;
  avgTat: number;
  meetPct: number;
}

/** Hires grouped by one field, with average TAT and Meet %. */
export function groupHires(rows: HireRow[], by: "taName" | "region" | "positionName" | "channel" | "am" | "rm"): GroupStat[] {
  const g = new Map<string, HireRow[]>();
  for (const r of rows) g.set(r[by], [...(g.get(r[by]) ?? []), r]);
  return [...g.entries()]
    .map(([key, list]) => ({
      key,
      hired: list.length,
      avgTat: Math.round(list.reduce((s, r) => s + r.tat, 0) / list.length),
      meetPct: Math.round((list.filter((r) => r.meet).length / list.length) * 100),
    }))
    .sort((a, b) => b.hired - a.hired || a.key.localeCompare(b.key, "th"));
}

export interface TurndownRow {
  date: LocalDate;
  name: string;
  branchCode: string;
  branchName: string;
  positionName: string;
  taName: string;
  offerDate: LocalDate;
  daysAfterOffer: number;
  channel: string;
  reason: string;
}

export function turndownsBetween(d: ReportData & { turndowns: Turndown[] }, reqs: Requisition[], first: LocalDate, last: LocalDate): TurndownRow[] {
  const { branches, positions, taFor } = lookups(d);
  const reqById = new Map(reqs.map((r) => [r.id, r]));
  return d.turndowns
    .filter((t) => t.turndown_date >= first && t.turndown_date <= last && reqById.has(t.req_id))
    .map((t) => {
      const r = reqById.get(t.req_id)!;
      return {
        date: t.turndown_date,
        name: `${t.title}${t.first_name} ${t.last_name}`,
        branchCode: r.branch_code,
        branchName: branchLabel(r.branch_code, branches.get(r.branch_code)),
        positionName: positions.get(r.position_code)?.position_name || r.position_code,
        taName: taFor(r).taName,
        offerDate: t.offer_date,
        daysAfterOffer: daysBetween(t.offer_date, t.turndown_date),
        channel: t.sourcing_channel || "-",
        reason: t.reason,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** "2026-11" for a date. */
export const monthOf = (d: LocalDate) => d.slice(0, 7);

/** Month before "YYYY-MM". */
export function previousMonth(month: string): string {
  return monthOf(addDays(monthRange(month).first, -1));
}

export function toSnapshot(rows: MonthlyRow[], month: string, computedAt: string): MonthlySnapshot[] {
  return rows.map((r) => ({
    month,
    // An account TA is stored by email; a TA from HR's database by name (as written, so it reads back the same).
    ta_email: r.ta.includes("@") ? r.ta : r.ta ? r.taName : "",
    region: r.region,
    carried_in: r.carriedIn,
    new: r.new,
    total: r.total,
    closed: r.closed,
    cancel: r.cancel,
    hold: r.hold,
    offer_pending: r.offerPending,
    remaining: r.remaining,
    tat_meet: r.tatMeet,
    tat_total: r.tatTotal,
    computed_at: computedAt,
  }));
}

/**
 * The latest snapshot of a month (a recompute appends a newer set rather than editing rows), or null if
 * the month was never closed. Rows outside the viewer's regions are left out by the caller via `keep`.
 */
export function fromSnapshot(
  snaps: MonthlySnapshot[],
  month: string,
  nameOf: (email: string) => string,
  keep: (s: MonthlySnapshot) => boolean = () => true,
): { rows: MonthlyRow[]; computedAt: string } | null {
  const forMonth = snaps.filter((s) => String(s.month).trim() === month);
  if (!forMonth.length) return null;
  const computedAt = forMonth.map((s) => s.computed_at).sort().at(-1)!;
  const rows = forMonth
    .filter((s) => s.computed_at === computedAt && keep(s))
    .map((s) => ({
      ta: normalizeEmail(s.ta_email),
      taName: nameOf(s.ta_email),
      region: s.region,
      carriedIn: s.carried_in,
      new: s.new,
      total: s.total,
      closed: s.closed,
      cancel: s.cancel,
      hold: s.hold,
      offerPending: s.offer_pending,
      remaining: s.remaining,
      tatMeet: s.tat_meet,
      tatTotal: s.tat_total,
      tatDays: 0,
      slaDays: 0,
    }))
    .sort((a, b) => a.taName.localeCompare(b.taName, "th") || a.region.localeCompare(b.region, "th"));
  return { rows, computedAt };
}
