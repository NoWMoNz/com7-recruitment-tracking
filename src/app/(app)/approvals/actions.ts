"use server";

import { getSessionUser } from "@/lib/auth/session-user";
import { planDecision } from "@/lib/domain/approval";
import { todayBangkok } from "@/lib/domain/dates";
import { getRepo } from "@/lib/repo";
import { fail, GONE, newId, writeError, type ActionResult } from "../action-utils";

/** super_admin approves or rejects a pending Cancel/Hold request. */
export async function decideApproval(approvalId: string, decision: "approve" | "reject", note: string): Promise<ActionResult> {
  const viewer = await getSessionUser();
  if (viewer.role !== "super_admin") return fail("เฉพาะผู้ดูแลระบบเท่านั้นที่อนุมัติได้");
  const repo = getRepo();
  const approval = await repo.getFresh("Approvals", approvalId);
  if (!approval) return fail(GONE);
  const req = await repo.getFresh("Requisitions", approval.req_id);
  if (!req) return fail(GONE);

  const plan = planDecision({ req, approval, decision, note, viewer, today: todayBangkok(), ids: { logId: newId("LOG") }, now: new Date() });
  if (!plan.ok) return plan;

  try {
    // The requisition's version check is what stops two admins deciding the same request at once.
    await repo.update("Requisitions", req.id, plan.value.reqPatch, req.version);
    await repo.update("Approvals", approval.id, plan.value.approvalPatch);
    await repo.append("StatusLog", [plan.value.logEntry]);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}
