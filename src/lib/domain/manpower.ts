import type { RecruiterAssignment } from "@/lib/repo/types";
import { branchLabel, branchTaOf, matchesPeople, peopleOfBranch, taOf, type PeopleFilter } from "./people";
import { inScope, normalizeEmail } from "./permissions";
import { buOf, ON_PROCESS, type Branch, type LocalDate, type Position, type QuotaLine, type Requisition, type User } from "./types";

/** Short = fewer people than quota in some position; over = more (and nothing short); full = every position on quota. */
export type ManpowerStatus = "short" | "over" | "full";
/** Open in the system compared with HR's shortage: equal, fewer open than short, or more open than short. */
export type OpenMatch = "match" | "fewer" | "more";

export interface ManpowerPosition {
  positionCode: string;
  positionName: string;
  quota: number;
  /** People on the payroll in HR's report. */
  hrActual: number;
  /** Candidates who have accepted an Offer and not started yet. */
  offers: number;
  /** hrActual + offers: an Offer already fills the seat, so it counts here and no longer as a shortage. */
  actual: number;
  short: number;
  over: number;
  /** Requisitions still being recruited for (Vacancy or waiting on an approval; an Offer is not open any more). */
  open: number;
  status: ManpowerStatus;
  match: OpenMatch;
}

export interface ManpowerRow {
  branchCode: string;
  branchName: string;
  bu: string;
  region: string;
  province: string;
  /** Area / Regional Manager of the branch; "" when not known. */
  am: string;
  rm: string;
  /** The account the branch belongs to (see branchTaOf); "" when not known. */
  taEmail: string;
  /** TA key and name the branch is shown and filtered under (see taOf). */
  ta: string;
  taName: string;
  quota: number;
  hrActual: number;
  offers: number;
  actual: number;
  /** Sum over positions of max(0, quota − actual), so a surplus in one position never hides a shortage in another. */
  short: number;
  over: number;
  open: number;
  status: ManpowerStatus;
  match: OpenMatch;
  positions: ManpowerPosition[];
}

export interface ManpowerFilter extends PeopleFilter {
  bu?: string;
  region?: string;
  status?: ManpowerStatus;
  q?: string;
}

export const MANPOWER_STATUS_LABEL: Record<ManpowerStatus, string> = { short: "ขาด", over: "เกิน", full: "ครบ" };
export const OPEN_MATCH_LABEL: Record<OpenMatch, string> = { match: "ตรงกัน", fewer: "เปิดไม่ครบ", more: "เปิดเกิน" };

const UNKNOWN_REGION = "ไม่ระบุ";
const statusOf = (short: number, over: number): ManpowerStatus => (short > 0 ? "short" : over > 0 ? "over" : "full");
const matchOf = (open: number, short: number): OpenMatch => (open === short ? "match" : open < short ? "fewer" : "more");

/**
 * One row per branch from HR's Quota lines. Closed branches, branches not in Branches and branches outside the
 * viewer's scope are left out; `closedBranches` counts the closed ones the viewer could have seen.
 */
export function buildManpowerRows(
  d: { quota: QuotaLine[]; requisitions: Requisition[]; branches: Branch[]; positions: Position[]; assignments: RecruiterAssignment[]; users: User[] },
  viewer: User,
  today: LocalDate,
): { rows: ManpowerRow[]; closedBranches: number } {
  const branches = new Map(d.branches.map((b) => [b.branch_code, b]));
  const positionName = new Map(d.positions.map((p) => [p.position_code, p.position_name]));
  const userName = new Map(d.users.map((u) => [normalizeEmail(u.email), u.name]));

  // An Offer is a seat already filled; every other in-progress requisition is still being recruited for.
  const open = new Map<string, number>();
  const offered = new Map<string, number>();
  for (const r of d.requisitions) {
    if (!ON_PROCESS.includes(r.status) || r.request_date > today) continue;
    const key = `${r.branch_code}|${r.position_code}`;
    const into = r.status === "Offer" ? offered : open;
    into.set(key, (into.get(key) ?? 0) + 1);
  }

  const byBranch = new Map<string, QuotaLine[]>();
  for (const l of d.quota) byBranch.set(l.branch_code, [...(byBranch.get(l.branch_code) ?? []), l]);

  const rows: ManpowerRow[] = [];
  const closed = new Set<string>();
  for (const [code, lines] of byBranch) {
    const b = branches.get(code);
    if (!b || !inScope(viewer, b)) continue;
    if (b.status === "Closed") {
      closed.add(code);
      continue;
    }
    const positions: ManpowerPosition[] = lines
      .map((l) => {
        const offers = offered.get(`${code}|${l.position_code}`) ?? 0;
        const actual = l.actual + offers;
        const short = Math.max(0, l.quota - actual);
        const over = Math.max(0, actual - l.quota);
        const o = open.get(`${code}|${l.position_code}`) ?? 0;
        return {
          positionCode: l.position_code,
          positionName: positionName.get(l.position_code) || l.position_code,
          quota: l.quota,
          hrActual: l.actual,
          offers,
          actual,
          short,
          over,
          open: o,
          status: statusOf(short, over),
          match: matchOf(o, short),
        };
      })
      .sort((a, b) => b.short - a.short || a.positionName.localeCompare(b.positionName, "th"));
    const sum = (k: "quota" | "hrActual" | "offers" | "actual" | "short" | "over" | "open") => positions.reduce((n, p) => n + p[k], 0);
    const short = sum("short");
    const over = sum("over");
    const taEmail = branchTaOf(code, d.assignments, d.requisitions);
    rows.push({
      branchCode: code,
      branchName: branchLabel(code, b),
      bu: buOf(b),
      region: b.region || UNKNOWN_REGION,
      province: b.province,
      ...peopleOfBranch(b),
      taEmail,
      ...taOf(b, taEmail, (e) => userName.get(e)),
      quota: sum("quota"),
      hrActual: sum("hrActual"),
      offers: sum("offers"),
      actual: sum("actual"),
      short,
      over,
      open: sum("open"),
      status: statusOf(short, over),
      match: matchOf(sum("open"), short),
      positions,
    });
  }
  rows.sort((a, b) => b.short - a.short || a.branchName.localeCompare(b.branchName, "th"));
  return { rows, closedBranches: closed.size };
}

export function filterManpowerRows(rows: ManpowerRow[], f: ManpowerFilter): ManpowerRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.bu && r.bu !== f.bu) return false;
    if (f.region && r.region !== f.region) return false;
    if (f.status && r.status !== f.status) return false;
    if (!matchesPeople(r, f)) return false;
    if (q && !`${r.branchName} ${r.branchCode}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function summarizeManpower(rows: ManpowerRow[]): { branches: number; quota: number; actual: number; short: number; over: number; full: number } {
  return {
    branches: rows.length,
    quota: rows.reduce((n, r) => n + r.quota, 0),
    actual: rows.reduce((n, r) => n + r.actual, 0),
    short: rows.reduce((n, r) => n + r.short, 0),
    over: rows.reduce((n, r) => n + r.over, 0),
    full: rows.filter((r) => r.status === "full").length,
  };
}
