import { addDays } from "./dates";
import type { ManpowerRow } from "./manpower";
import type { ResignRow } from "./resign";
import { buOf, type Branch, type LocalDate, type Offer, type Requisition, type Turndown, type User } from "./types";
import { peopleOfBranch, taOf, type People } from "./people";
import { inScope } from "./permissions";

/** How far ahead the dashboard looks for resignations, and how far back it looks for declined Offers. */
export const RESIGN_LOOKAHEAD_DAYS = 30;
export const OFFER_LOOKBACK_DAYS = 90;

const UNKNOWN_REGION = "ไม่ระบุ";

/** Where a figure belongs, so the dashboard's region / province / BU / AM / RM / TA filters can narrow it. */
export interface Place extends People {
  region: string;
  province: string;
  bu: string;
}

/* ---------- Resignations still to take effect ---------- */

export interface UpcomingResign extends Place {
  branchName: string;
  positionName: string;
  effectiveDate: LocalDate;
}

/** Resignations that have not taken effect yet (withdrawn ones excluded), soonest first. */
export function upcomingResignations(rows: ResignRow[]): UpcomingResign[] {
  return rows
    .filter((r) => r.state === "upcoming")
    .map((r) => ({ region: r.region, province: r.province, bu: r.bu, am: r.am, rm: r.rm, ta: r.ta, branchName: r.branchName, positionName: r.positionName, effectiveDate: r.effectiveDate }))
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export function summarizeResignations(items: UpcomingResign[], today: LocalDate): { soon: UpcomingResign[]; later: number } {
  const edge = addDays(today, RESIGN_LOOKAHEAD_DAYS);
  const soon = items.filter((r) => r.effectiveDate <= edge);
  return { soon, later: items.length - soon.length };
}

/* ---------- Headcount gap nobody is recruiting for ---------- */

export interface ManpowerGap extends Place {
  branchName: string;
  /** HR's shortage for the branch, summed over positions. */
  short: number;
  /** Shortage no requisition covers: per position, short minus what is open, never below 0. */
  gap: number;
}

/**
 * Branches where HR says people are missing but fewer requisitions are open than that. Counted per position, so
 * one position opened twice over never hides another that has none. Branches with no such gap are left out.
 */
export function manpowerGaps(rows: ManpowerRow[]): ManpowerGap[] {
  return rows
    .map((r) => ({
      region: r.region,
      province: r.province,
      bu: r.bu,
      am: r.am,
      rm: r.rm,
      ta: r.ta,
      branchName: r.branchName,
      short: r.short,
      gap: r.positions.reduce((n, p) => n + Math.max(0, p.short - p.open), 0),
    }))
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.branchName.localeCompare(b.branchName, "th"));
}

/* ---------- Offers turned down ---------- */

export interface OfferOutcome extends Place {
  /** Empty for an Offer that was not turned down. */
  declinedReason: string | null;
}

/**
 * Every Offer made in the last OFFER_LOOKBACK_DAYS days (still open, hired or turned down) with where it was and,
 * for the ones turned down, why. Offers at branches outside the viewer's scope are left out.
 */
export function offerOutcomes(
  d: { offers: Offer[]; newHires: Offer[]; turndowns: Turndown[]; requisitions: Requisition[]; branches: Branch[] },
  viewer: User,
  today: LocalDate,
): OfferOutcome[] {
  const since = addDays(today, -(OFFER_LOOKBACK_DAYS - 1));
  const branchByCode = new Map(d.branches.map((b) => [b.branch_code, b]));
  const reqById = new Map(d.requisitions.map((r) => [r.id, r]));
  const out: OfferOutcome[] = [];
  const add = (o: Offer, declinedReason: string | null) => {
    if (o.offer_date < since || o.offer_date > today) return;
    const r = reqById.get(o.req_id);
    const b = branchByCode.get(r?.branch_code ?? "");
    if (!b || !inScope(viewer, b)) return;
    out.push({ region: b.region || UNKNOWN_REGION, province: b.province, bu: buOf(b), ...peopleOfBranch(b), ta: taOf(b, r?.ta_email ?? "", () => undefined, r?.ta_name).ta, declinedReason });
  };
  for (const o of d.offers) add(o, null);
  for (const o of d.newHires) add(o, null);
  for (const t of d.turndowns) add(t, t.reason.trim() || "ไม่ระบุเหตุผล");
  return out;
}

export function summarizeDeclines(items: OfferOutcome[]): { total: number; declined: number; pct: number | null; reasons: { reason: string; count: number }[] } {
  const counts = new Map<string, number>();
  for (const i of items) if (i.declinedReason !== null) counts.set(i.declinedReason, (counts.get(i.declinedReason) ?? 0) + 1);
  const declined = [...counts.values()].reduce((n, c) => n + c, 0);
  return {
    total: items.length,
    declined,
    pct: items.length ? Math.round((declined / items.length) * 100) : null,
    reasons: [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "th")),
  };
}
