import { getRepo } from "@/lib/repo";
import { buildReviewWorkbook } from "@/lib/report/excel";
import { exportViewer, xlsxResponse } from "@/lib/report/export-response";

/** Excel export of the open review items on the processing page (super_admin only, like the page). */
export async function GET() {
  const v = await exportViewer({ adminOnly: true });
  if ("denied" in v) return v.denied;
  const reviews = await getRepo().list("ReviewQueue");
  return xlsxResponse(await buildReviewWorkbook(reviews.filter((r) => !r.resolved_at)));
}
