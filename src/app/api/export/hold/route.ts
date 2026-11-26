import type { NextRequest } from "next/server";
import { todayBangkok } from "@/lib/domain/dates";
import { buildHoldRows, filterHoldRows } from "@/lib/domain/queues";
import { getRepo } from "@/lib/repo";
import { buildHoldWorkbook } from "@/lib/report/excel";
import { exportViewer, param, xlsxResponse } from "@/lib/report/export-response";

/** Excel export of the Hold list with the page's filters, scoped to the signed-in user. */
export async function GET(request: NextRequest) {
  const v = await exportViewer();
  if ("denied" in v) return v.denied;
  const repo = getRepo();
  const [requisitions, approvals, log, branches, positions, users] = await Promise.all([
    repo.list("Requisitions"),
    repo.list("Approvals"),
    repo.list("StatusLog"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
  ]);
  const get = param(request.nextUrl.searchParams);
  const rows = buildHoldRows({ requisitions, approvals, log, branches, positions, users }, v.user, todayBangkok());
  return xlsxResponse(await buildHoldWorkbook(filterHoldRows(rows, { region: get("region"), q: get("q") })));
}
