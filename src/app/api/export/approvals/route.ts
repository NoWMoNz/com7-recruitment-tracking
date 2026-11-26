import { buildApprovalRows } from "@/lib/domain/queues";
import { getRepo } from "@/lib/repo";
import { buildApprovalsWorkbook } from "@/lib/report/excel";
import { exportViewer, xlsxResponse } from "@/lib/report/export-response";

/** Excel export of the Cancel / Hold requests waiting for a decision (super_admin only, like the page). */
export async function GET() {
  const v = await exportViewer({ adminOnly: true });
  if ("denied" in v) return v.denied;
  const repo = getRepo();
  const [approvals, requisitions, branches, positions, users] = await Promise.all([
    repo.list("Approvals"),
    repo.list("Requisitions"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
  ]);
  return xlsxResponse(await buildApprovalsWorkbook(buildApprovalRows({ approvals, requisitions, branches, positions, users }, v.user)));
}
