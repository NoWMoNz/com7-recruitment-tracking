import { describe, expect, test } from "vitest";
import { buildApprovalRows, buildApprovalStatusRows, buildHoldRows, filterHoldRows } from "@/lib/domain/queues";
import type { Approval, StatusLogEntry } from "@/lib/domain/types";
import { branch, positions, req, user } from "./helpers";

const ju = user({ email: "ju@example.com", role: "super_admin", name: "จู" });
const mind = user({ email: "mind@example.com", name: "มายด์" });
const north = user({ email: "n@example.com", role: "viewer", scope: "ภาคเหนือ" });
const branches = [branch({ branch_code: "BKK-012", branch_name: "ลาดพร้าว" }), branch({ branch_code: "CNX-001", region: "ภาคเหนือ" })];
const users = [ju, mind];

const approval = (p: Partial<Approval> & Pick<Approval, "id" | "req_id">): Approval => ({
  type: "Hold", reason: "ปรับปรุงร้าน", effective_date: "2026-11-16", evidence_url: "local:x", requested_by: "mind@example.com",
  requested_at: "2026-11-16T03:00:00Z", status: "Pending", decided_by: "", decided_at: "", decision_note: "", ...p,
});

describe("buildApprovalRows", () => {
  const data = {
    requisitions: [req({ id: "R1", status: "PendingHold" }), req({ id: "R2", status: "PendingCancel", branch_code: "CNX-001" }), req({ id: "R3" })],
    approvals: [
      approval({ id: "A2", req_id: "R2", type: "Cancel", requested_at: "2026-11-15T03:00:00Z" }),
      approval({ id: "A1", req_id: "R1" }),
      approval({ id: "A3", req_id: "R3", status: "Rejected" }),
    ],
    branches,
    positions,
    users,
  };

  test("pending only, oldest request first, joined with branch/position/requester", () => {
    const rows = buildApprovalRows(data, ju);
    expect(rows.map((r) => r.id)).toEqual(["A2", "A1"]);
    expect(rows[1]).toMatchObject({ reqId: "R1", branchName: "ID BKK-012_ลาดพร้าว", positionName: "Sales", requestedBy: "มายด์", type: "Hold", evidenceRef: "local:x" });
  });

  test("respects the viewer's scope", () => {
    expect(buildApprovalRows(data, north).map((r) => r.id)).toEqual(["A2"]);
  });
});

describe("buildHoldRows", () => {
  const log: StatusLogEntry[] = [
    { id: "L1", req_id: "R1", from_status: "PendingHold", to_status: "Hold", effective_date: "2026-11-01", actor: "", at: "a", note: "", ref_id: "A1" },
  ];
  const data = {
    requisitions: [req({ id: "R1", status: "Hold", request_date: "2026-10-02" }), req({ id: "R2" })],
    approvals: [approval({ id: "A1", req_id: "R1", status: "Approved", decided_at: "2026-11-01T05:00:00Z", decided_by: "ju@example.com" })],
    log,
    branches,
    positions,
    users,
  };

  test("lists Hold requisitions with the frozen TAT, days held, reason and edit right", () => {
    const rows = buildHoldRows(data, mind, "2026-11-17");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reqId: "R1", holdSince: "2026-11-01", tatAtHold: 30, daysHeld: 16, reason: "ปรับปรุงร้าน", canEdit: true, taName: "มายด์", approvedAt: "2026-11-01", approvedBy: "จู" });
    expect(buildHoldRows(data, user({ email: "x@example.com" }), "2026-11-17")[0].canEdit).toBe(false);
  });

  test("filterHoldRows: region and a search over shop, position, TA and reason (the page's filters, also used by the export)", () => {
    const rows = buildHoldRows(data, mind, "2026-11-17");
    expect(filterHoldRows(rows, { q: "ปรับปรุง" })).toHaveLength(1);
    expect(filterHoldRows(rows, { q: "ไม่มีคำนี้" })).toHaveLength(0);
    expect(filterHoldRows(rows, { region: "ภาคเหนือ" })).toHaveLength(0);
    expect(filterHoldRows(rows, {})).toHaveLength(1);
  });
});

describe("buildApprovalStatusRows (what an admin sees of the requests)", () => {
  const data = {
    requisitions: [req({ id: "R1", status: "PendingHold" }), req({ id: "R2", status: "Cancel" }), req({ id: "R3" }), req({ id: "R4", branch_code: "CNX-001" })],
    approvals: [
      approval({ id: "A1", req_id: "R1", requested_at: "2026-11-20T03:00:00Z" }),
      approval({ id: "A2", req_id: "R2", type: "Cancel", status: "Approved", decided_at: "2026-11-25T03:00:00Z" }),
      approval({ id: "A3", req_id: "R3", status: "Rejected", decided_at: "2026-09-01T03:00:00Z" }),
      approval({ id: "A4", req_id: "R4", requested_at: "2026-11-21T03:00:00Z" }),
    ],
    branches,
    positions,
    users,
  };

  test("only the type, the position and shop, and the status: pending first, then decided in the last 30 days", () => {
    const rows = buildApprovalStatusRows(data, user({ email: "ad@example.com", role: "admin" }), "2026-11-27");
    expect(rows).toEqual([
      { id: "A4", type: "Hold", positionName: "Sales", branchName: "ID CNX-001", status: "Pending" },
      { id: "A1", type: "Hold", positionName: "Sales", branchName: "ID BKK-012_ลาดพร้าว", status: "Pending" },
      { id: "A2", type: "Cancel", positionName: "Sales", branchName: "ID BKK-012_ลาดพร้าว", status: "Approved" },
    ]);
  });

  test("requests outside the viewer's scope are left out", () => {
    expect(buildApprovalStatusRows(data, user({ email: "n@example.com", role: "admin", scope: "ภาคเหนือ" }), "2026-11-27").map((r) => r.id)).toEqual(["A4"]);
  });
});
