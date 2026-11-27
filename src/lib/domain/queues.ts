import { branchLabel, peopleOfBranch, taOf } from "./people";
import { holdStart } from "./approval";
import { canEditRequisition, inScope, normalizeEmail } from "./permissions";
import { computeTat, holdDays } from "./tat";
import { buOf, type Approval, type ApprovalType, type Branch, type LocalDate, type Position, type Requisition, type StatusLogEntry, type User } from "./types";

interface Lookups {
  requisitions: Requisition[];
  branches: Branch[];
  positions: Position[];
  users: User[];
}

interface Place {
  reqId: string;
  version: number;
  region: string;
  province: string;
  bu: string;
  branchCode: string;
  branchName: string;
  positionName: string;
  requestDate: LocalDate;
  /** TA key and name the row is shown and filtered under (see taOf), and the branch's Area / Regional Manager. */
  ta: string;
  taName: string;
  am: string;
  rm: string;
}

const UNKNOWN_REGION = "ไม่ระบุ";

function makeLookup(d: Lookups) {
  const branches = new Map(d.branches.map((b) => [b.branch_code, b]));
  const positions = new Map(d.positions.map((p) => [p.position_code, p]));
  const users = new Map(d.users.map((u) => [normalizeEmail(u.email), u]));
  const nameOf = (email: string) => users.get(normalizeEmail(email))?.name || email;
  const place = (r: Requisition): Place => {
    const b = branches.get(r.branch_code);
    return {
      reqId: r.id,
      version: r.version,
      region: b?.region || UNKNOWN_REGION,
      province: b?.province ?? "",
      bu: buOf(b),
      branchCode: r.branch_code,
      branchName: branchLabel(r.branch_code, b),
      positionName: positions.get(r.position_code)?.position_name || r.position_code,
      requestDate: r.request_date,
      ...taOf(b, r.ta_email, (e) => users.get(e)?.name),
      ...peopleOfBranch(b),
    };
  };
  const visible = (viewer: User, r: Requisition) => inScope(viewer, branches.get(r.branch_code) ?? { region: UNKNOWN_REGION, branch_code: r.branch_code });
  return { place, nameOf, visible };
}

export interface ApprovalRow extends Place {
  id: string;
  type: ApprovalType;
  reason: string;
  effectiveDate: LocalDate;
  evidenceRef: string;
  requestedBy: string;
  requestedAt: string;
}

/** Pending Cancel/Hold requests the viewer can see, oldest first. */
export function buildApprovalRows(d: Lookups & { approvals: Approval[] }, viewer: User): ApprovalRow[] {
  const { place, nameOf, visible } = makeLookup(d);
  const reqs = new Map(d.requisitions.map((r) => [r.id, r]));
  const rows: ApprovalRow[] = [];
  for (const a of d.approvals) {
    const r = reqs.get(a.req_id);
    if (a.status !== "Pending" || !r || !visible(viewer, r)) continue;
    rows.push({
      ...place(r),
      id: a.id,
      type: a.type,
      reason: a.reason,
      effectiveDate: a.effective_date,
      evidenceRef: a.evidence_url,
      requestedBy: nameOf(a.requested_by),
      requestedAt: a.requested_at,
    });
  }
  return rows.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

export interface HoldRow extends Place {
  holdSince: LocalDate | null;
  /** Days spent on hold so far in this hold. */
  daysHeld: number;
  /** TAT frozen at the start of the hold. */
  tatAtHold: number;
  reason: string;
  /** Who approved the hold and on what date; empty for holds that came from the go-live import. */
  approvedBy: string;
  approvedAt: LocalDate | null;
  canEdit: boolean;
}

/** The Hold page's filters; the Excel export applies the same ones. */
export function filterHoldRows(rows: HoldRow[], f: { region?: string; q?: string }): HoldRow[] {
  const needle = f.q?.trim().toLowerCase() ?? "";
  return rows.filter(
    (r) => (!f.region || r.region === f.region) && (!needle || `${r.branchName} ${r.branchCode} ${r.positionName} ${r.taName} ${r.reason}`.toLowerCase().includes(needle)),
  );
}

/** Requisitions on Hold that the viewer can see, longest hold first. */
export function buildHoldRows(d: Lookups & { approvals: Approval[]; log: StatusLogEntry[] }, viewer: User, today: LocalDate): HoldRow[] {
  const { place, nameOf, visible } = makeLookup(d);
  const rows: HoldRow[] = [];
  for (const r of d.requisitions) {
    if (r.status !== "Hold" || !visible(viewer, r)) continue;
    const since = holdStart(d.log, r.id);
    const tatAtHold = since ? computeTat({ requestDate: r.request_date, endDate: since, holdDays: holdDays(d.log, r.id, since) }) : 0;
    const approval = d.approvals
      .filter((a) => a.req_id === r.id && a.type === "Hold" && a.status === "Approved")
      .sort((a, b) => a.decided_at.localeCompare(b.decided_at))
      .at(-1);
    rows.push({
      ...place(r),
      holdSince: since,
      daysHeld: since ? Math.max(0, computeTat({ requestDate: since, endDate: today, holdDays: 0 })) : 0,
      tatAtHold,
      reason: approval?.reason ?? "",
      approvedBy: approval ? nameOf(approval.decided_by) : "",
      approvedAt: approval?.decided_at ? approval.decided_at.slice(0, 10) : null,
      canEdit: canEditRequisition(viewer, r),
    });
  }
  return rows.sort((a, b) => (a.holdSince ?? "").localeCompare(b.holdSince ?? ""));
}
