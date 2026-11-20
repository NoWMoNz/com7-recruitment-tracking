import { randomUUID } from "node:crypto";
import { todayBangkok } from "@/lib/domain/dates";
import type { Plan } from "@/lib/domain/offer";
import { planWithdrawal, resignRef, type WithdrawOutcome } from "@/lib/domain/resign";
import type { LocalDate, User } from "@/lib/domain/types";
import type { Repo } from "@/lib/repo/types";

const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;

/**
 * Withdraws one resignation (ยกเลิกลาออก). The caller gives the sheet row it showed the user plus the employee id
 * and effective date on it; if the sheet now holds something else at that row the call is refused.
 *
 * Writes go requisition first (its version check is what catches a concurrent change), then the log, then the
 * review item, and the Import_Resign row last: if any earlier write fails the row stays unmarked, so the user can
 * simply try again. `ConflictError` / `NotFoundError` from the repo propagate to the caller.
 */
export async function runWithdrawal(
  repo: Repo,
  viewer: User,
  input: { rowNumber: number; employeeId: string; effectiveDate: LocalDate; note: string },
  opts: { now?: Date; today?: LocalDate } = {},
): Promise<Plan<{ outcome: WithdrawOutcome }>> {
  const now = opts.now ?? new Date();
  const today = opts.today ?? todayBangkok(now);
  const stale: Plan<never> = { ok: false, errors: { form: "ไม่พบรายการลาออกนี้แล้ว กรุณาโหลดใหม่" } };

  // An old sheet without the withdrawal columns would drop the mark silently: stop before anything is written.
  await repo.requireColumns("Import_Resign", ["cancelled_at", "cancelled_by", "cancel_note"]);
  for (const tab of ["Requisitions", "ReviewQueue", "Import_Resign", "StatusLog"] as const) await repo.invalidate(tab);
  const [numbered, branches, requisitions, reviewQueue, log] = await Promise.all([
    repo.listNumbered("Import_Resign"),
    repo.list("Branches"),
    repo.list("Requisitions"),
    repo.list("ReviewQueue"),
    repo.list("StatusLog"),
  ]);

  const target = numbered.find((n) => n.rowNumber === input.rowNumber);
  if (!target || target.row.employee_id.trim() !== input.employeeId.trim() || target.row.effective_date !== input.effectiveDate) return stale;
  const row = target.row;

  const linked = requisitions.find((r) => r.source_ref === resignRef(row));
  // The version the update is checked against must be the live one, not a cached copy.
  const req = linked ? await repo.getFresh("Requisitions", linked.id) : null;
  const offer = req?.offer_id ? ((await repo.list("Offers")).find((o) => o.id === req.offer_id) ?? null) : null;

  const plan = planWithdrawal({
    row,
    branch: branches.find((b) => b.branch_code === row.branch_code),
    req,
    log: req ? log.filter((e) => e.req_id === req.id) : [],
    offer,
    reviewRefs: new Set(reviewQueue.map((r) => r.ref)),
    viewer,
    note: input.note,
    today,
    ids: { logId: newId("LOG"), reviewId: newId("REV") },
    now,
  });
  if (!plan.ok) return plan;

  const { reqPatch, logEntry, review, importPatch, outcome } = plan.value;
  if (req && reqPatch) await repo.update("Requisitions", req.id, reqPatch, req.version);
  if (logEntry) await repo.append("StatusLog", [logEntry]);
  if (review) await repo.append("ReviewQueue", [review]);
  await repo.updateAt("Import_Resign", [{ rowNumber: input.rowNumber, patch: importPatch }]);
  return { ok: true, value: { outcome } };
}
