import { holdStart } from "./approval";
import { canEditRequisition, inScope, normalizeEmail } from "./permissions";
import { computeTat, holdDays } from "./tat";
import type { Approval, ApprovalType, Branch, LocalDate, Position, Requisition, StatusLogEntry, User } from "./types";

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
  branchCode: string;
  branchName: string;
  positionName: string;
  requestDate: LocalDate;
  taName: string;
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
      branchCode: r.branch_code,
      branchName: b?.branch_name || r.branch_code,
      positionName: positions.get(r.position_code)?.position_name || r.position_code,
      requestDate: r.request_date,
      taName: nameOf(r.ta_email),
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
