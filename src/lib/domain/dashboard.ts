import { normalizeProvince } from "@/lib/geo/province";
import { daysBetween } from "./dates";
import { monthlyRows, previousMonth, monthOf, type ReportData } from "./report";
import type { AgingBand } from "./tat";
import type { TrackingRow } from "./tracking";
import { UNKNOWN_BU, buOf, type LocalDate, type NewHire, type Offer, type Requisition, type Turndown } from "./types";

/** A vacancy that has used this share of its SLA (and is not over it yet) counts as "near SLA". */
export const NEAR_SLA_RATIO = 0.7;
/** An Offer with no hire after this many days is flagged as stale. */
export const OFFER_STALE_DAYS = 14;

/** Figures for one slice of rows (a region, province, TA, position or branch). Upcoming rows are ignored. */
export interface RowStats {
  open: number;
  offers: number;
  notMeet: number;
  avgAging: number | null;
  bands: Record<AgingBand, number>;
  /** Still-vacant row that has waited longest. */
  oldest: TrackingRow | null;
}

export function statsOf(rows: TrackingRow[]): RowStats {
  const live = rows.filter((r) => !r.upcoming);
  const vacant = live.filter((r) => r.agingBand !== null);
  const bands: Record<AgingBand, number> = { green: 0, orange: 0, red: 0, darkred: 0 };
  for (const r of vacant) bands[r.agingBand!]++;
  return {
    open: live.length,
    offers: live.filter((r) => r.status === "Offer").length,
    notMeet: live.filter((r) => r.tatResult === "NotMeet").length,
    avgAging: vacant.length ? Math.round(vacant.reduce((s, r) => s + r.tat, 0) / vacant.length) : null,
    bands,
    oldest: vacant.reduce<TrackingRow | null>((best, r) => (!best || r.tat > best.tat ? r : best), null),
  };
}

function bucket(rows: TrackingRow[], key: (r: TrackingRow) => string): Map<string, TrackingRow[]> {
  const m = new Map<string, TrackingRow[]>();
  for (const r of rows) {
    if (r.upcoming) continue;
    const k = key(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

/** Stats per province, keyed by the map's province name. Rows without a province are skipped. */
export function provinceStats(rows: TrackingRow[]): Map<string, RowStats> {
  return new Map([...bucket(rows.filter((r) => r.province), (r) => normalizeProvince(r.province))].map(([k, v]) => [k, statsOf(v)]));
}

export interface DashboardSummary extends RowStats {
  /** Vacancy still counted as open: on-process rows whose effective date has arrived. */
  open: number;
  offers: number;
  /** Share of judged rows (Meet / (Meet + NotMeet)), or null when nothing has been judged yet. */
  tatMeetPct: number | null;
  avgAging: number | null;
  bands: Record<AgingBand, number>;
  /** Rows judged against SLA: Meet, NotMeet (offered late or vacant past SLA) and still within SLA. */
  tat: { meet: number; notMeet: number; inProgress: number };
  regions: ({ name: string } & RowStats)[];
  tas: ({ email: string; name: string } & RowStats)[];
}

export function summarize(rows: TrackingRow[]): DashboardSummary {
  const live = rows.filter((r) => !r.upcoming);
  const all = statsOf(live);
  const met = live.filter((r) => r.tatResult === "Meet").length;

  const regions = [...bucket(live, (r) => r.region)].map(([name, v]) => ({ name, ...statsOf(v) }));
  const tas = [...bucket(live, (r) => r.taEmail)].map(([email, v]) => ({ email, name: v[0].taName, ...statsOf(v) }));
  const byOpen = (a: { open: number; name: string }, b: { open: number; name: string }) => b.open - a.open || a.name.localeCompare(b.name, "th");

  return {
    open: all.open,
    offers: all.offers,
    tatMeetPct: met + all.notMeet > 0 ? Math.round((met / (met + all.notMeet)) * 100) : null,
    avgAging: all.avgAging,
    bands: all.bands,
    notMeet: all.notMeet,
    oldest: all.oldest,
    tat: { meet: met, notMeet: all.notMeet, inProgress: live.filter((r) => r.tatResult === "InProgress").length },
    regions: regions.sort(byOpen),
    tas: tas.sort(byOpen),
  };
}

const isVacant = (r: TrackingRow) => !r.upcoming && r.agingBand !== null;

/** Still-vacant rows that have waited longest. */
export function longestOpen(rows: TrackingRow[], limit = 8): TrackingRow[] {
  return rows
    .filter(isVacant)
    .sort((a, b) => b.tat - a.tat || a.branchName.localeCompare(b.branchName, "th"))
    .slice(0, limit);
}

/** Vacancies not yet over their SLA but past `ratio` of it (0.7 = 21 of 30 days), closest to the limit first. */
export function nearSla(rows: TrackingRow[], ratio = NEAR_SLA_RATIO, limit = 8): TrackingRow[] {
  return rows
    .filter((r) => isVacant(r) && r.tat <= r.slaDays && r.tat >= r.slaDays * ratio)
    .sort((a, b) => a.slaDays - a.tat - (b.slaDays - b.tat) || b.tat - a.tat)
    .slice(0, limit);
}

/** Offers still waiting for the candidate to start, oldest first. `days` counts from the offer date. */
export function offersWaiting(rows: TrackingRow[], today: LocalDate, limit = 8): { row: TrackingRow; days: number }[] {
  return rows
    .filter((r) => !r.upcoming && r.status === "Offer" && r.offerDate)
    .map((row) => ({ row, days: Math.max(0, daysBetween(row.offerDate!, today)) }))
    .sort((a, b) => b.days - a.days)
    .slice(0, limit);
}

export type GroupStat = { name: string } & RowStats;

/** Open requisitions grouped by position, branch or business unit, biggest group first. */
export function groupOpen(rows: TrackingRow[], by: "positionName" | "branchName" | "bu", limit = 8): GroupStat[] {
  return [...bucket(rows, (r) => r[by])]
    .map(([name, v]) => ({ name, ...statsOf(v) }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, "th"))
    .slice(0, limit);
}

export interface TrendRow {
  region: string;
  bu: string;
  new: number;
  offers: number;
  closed: number;
  cancel: number;
  hold: number;
  /** Still open at month end (today for the current month). */
  open: number;
  /** Over the offers made in the month: total TAT days and total SLA days they were judged against. */
  tatDays: number;
  slaDays: number;
}
export interface TrendMonth {
  /** "YYYY-MM" */
  month: string;
  rows: TrendRow[];
}
export type TrendPoint = Omit<TrendRow, "region" | "bu"> & { month: string };

/** Last `count` months (oldest first, ending with the month of `today`), one row per region and business unit. */
export function buildTrend(
  d: ReportData & { offers: (Offer | Turndown | NewHire)[] },
  reqs: Requisition[],
  today: LocalDate,
  count = 6,
): TrendMonth[] {
  const months: string[] = [monthOf(today)];
  while (months.length < count) months.unshift(previousMonth(months[0]));
  // The monthly cut groups by TA and region only, so it is run once per business unit to keep the BU on each row.
  const branchBu = new Map(d.branches.map((b) => [b.branch_code, buOf(b)]));
  const byBu = new Map<string, Requisition[]>();
  for (const r of reqs) {
    const bu = branchBu.get(r.branch_code) ?? UNKNOWN_BU;
    byBu.set(bu, [...(byBu.get(bu) ?? []), r]);
  }
  return months.map((month) => {
    const rows = new Map<string, TrendRow>();
    for (const [bu, list] of byBu) {
      for (const m of monthlyRows(d, list, month, today)) {
        const key = `${m.region}|${bu}`;
        const t = rows.get(key) ?? { region: m.region, bu, new: 0, offers: 0, closed: 0, cancel: 0, hold: 0, open: 0, tatDays: 0, slaDays: 0 };
        t.new += m.new;
        t.offers += m.tatTotal;
        t.closed += m.closed;
        t.cancel += m.cancel;
        t.hold += m.hold;
        t.open += m.remaining;
        t.tatDays += m.tatDays;
        t.slaDays += m.slaDays;
        rows.set(key, t);
      }
    }
    return { month, rows: [...rows.values()] };
  });
}

/** One point per month, summed over every region (or just `region`) and every business unit (or just `bu`). */
export function sumTrend(months: TrendMonth[], region: string, bu = ""): TrendPoint[] {
  return months.map(({ month, rows }) => {
    const p: TrendPoint = { month, new: 0, offers: 0, closed: 0, cancel: 0, hold: 0, open: 0, tatDays: 0, slaDays: 0 };
    for (const r of rows) {
      if ((region && r.region !== region) || (bu && r.bu !== bu)) continue;
      p.new += r.new;
      p.offers += r.offers;
      p.closed += r.closed;
      p.cancel += r.cancel;
      p.hold += r.hold;
      p.open += r.open;
      p.tatDays += r.tatDays;
      p.slaDays += r.slaDays;
    }
    return p;
  });
}

export interface Momentum {
  /** Open positions now minus at the end of last month; null when there is no earlier month or it had none open. */
  openDelta: number | null;
  /** Offers made this month so far: how many, average days taken (TAT) and the average limit (SLA) they were judged against. */
  offers: number;
  avgTat: number | null;
  avgSla: number | null;
  /** Average TAT this month minus last month's (negative = faster); null unless both months have offers. */
  tatDelta: number | null;
}

const avgDays = (days: number, n: number) => (n > 0 ? Math.round(days / n) : null);

/** How the latest month of `points` compares with the one before it. */
export function momentum(points: TrendPoint[]): Momentum {
  const cur = points.at(-1);
  const prev = points.at(-2);
  const avgTat = cur ? avgDays(cur.tatDays, cur.offers) : null;
  const prevTat = prev ? avgDays(prev.tatDays, prev.offers) : null;
  return {
    // Nothing open at last month's end means no baseline yet (the data starts this month), so a change would only restate the total.
    openDelta: cur && prev && prev.open > 0 ? cur.open - prev.open : null,
    offers: cur?.offers ?? 0,
    avgTat,
    avgSla: cur ? avgDays(cur.slaDays, cur.offers) : null,
    tatDelta: avgTat !== null && prevTat !== null ? avgTat - prevTat : null,
  };
}
