import { branchLabel, matchesPeople, peopleOfBranch, taOf, type People, type PeopleFilter } from "./people";
import { inScope, normalizeEmail } from "./permissions";
import { buOf, type Branch, type LocalDate, type NewHire, type Position, type Requisition, type User } from "./types";

/** A person who got an employee ID: the Offer, plus HR's employee ID and start date, and where they went. */
export interface HiredRow extends People {
  id: string;
  reqId: string;
  employeeId: string;
  name: string;
  /** HR's start date, else the one planned at the Offer; null when neither is known. */
  startDate: LocalDate | null;
  hiredAt: LocalDate;
  offerDate: LocalDate;
  tat: number;
  tatResult: "Meet" | "NotMeet";
  channel: string;
  positionName: string;
  branchCode: string;
  branchName: string;
  bu: string;
  region: string;
  province: string;
  taName: string;
}

export interface HiredFilter extends PeopleFilter {
  bu?: string;
  region?: string;
  /** Start date range, both ends inclusive; an open end is unbounded. */
  from?: LocalDate;
  to?: LocalDate;
  q?: string;
}

const UNKNOWN_REGION = "ไม่ระบุ";

/** Hires the viewer may see, latest start date first (unknown start dates last). */
export function buildHiredRows(
  d: { newHires: NewHire[]; requisitions: Requisition[]; branches: Branch[]; positions: Position[]; users: User[] },
  viewer: User,
): HiredRow[] {
  const reqs = new Map(d.requisitions.map((r) => [r.id, r]));
  const branches = new Map(d.branches.map((b) => [b.branch_code, b]));
  const positions = new Map(d.positions.map((p) => [p.position_code, p]));
  const users = new Map(d.users.map((u) => [normalizeEmail(u.email), u]));
  const rows: HiredRow[] = [];
  for (const h of d.newHires) {
    const r = reqs.get(h.req_id);
    const code = r?.branch_code ?? "";
    const b = branches.get(code);
    if (!inScope(viewer, b ?? { region: UNKNOWN_REGION, branch_code: code })) continue;
    const ta = r?.ta_email || h.ta_email;
    rows.push({
      id: h.id,
      reqId: h.req_id,
      employeeId: h.employee_id,
      name: `${h.title}${h.first_name} ${h.last_name}`.trim(),
      startDate: h.start_date ?? h.planned_start_date ?? null,
      hiredAt: h.hired_at,
      offerDate: h.offer_date,
      tat: h.tat,
      tatResult: h.tat_result === "Meet" ? "Meet" : "NotMeet",
      channel: h.sourcing_channel,
      positionName: positions.get(r?.position_code ?? "")?.position_name || r?.position_code || "-",
      branchCode: code,
      branchName: branchLabel(code, b),
      bu: buOf(b),
      region: b?.region || UNKNOWN_REGION,
      province: b?.province ?? "",
      ...peopleOfBranch(b),
      ...taOf(b, ta, (e) => users.get(e)?.name),
    });
  }
  const startKey = (x: HiredRow) => x.startDate ?? "";
  return rows.sort((a, b) => startKey(b).localeCompare(startKey(a)) || b.hiredAt.localeCompare(a.hiredAt) || a.name.localeCompare(b.name, "th"));
}

export function filterHiredRows(rows: HiredRow[], f: HiredFilter): HiredRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.bu && r.bu !== f.bu) return false;
    if (f.region && r.region !== f.region) return false;
    if ((f.from || f.to) && (!r.startDate || (f.from && r.startDate < f.from) || (f.to && r.startDate > f.to))) return false;
    if (!matchesPeople(r, f)) return false;
    if (q && !`${r.name} ${r.employeeId} ${r.branchName} ${r.branchCode} ${r.positionName} ${r.taName}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
