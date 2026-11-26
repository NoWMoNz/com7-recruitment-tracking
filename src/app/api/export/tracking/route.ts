import type { NextRequest } from "next/server";
import { todayBangkok } from "@/lib/domain/dates";
import { parseSettings } from "@/lib/domain/settings";
import type { AgingBand } from "@/lib/domain/tat";
import { buildTrackingRows, filterTrackingRows, type TrackingStatusFilter } from "@/lib/domain/tracking";
import { getRepo } from "@/lib/repo";
import { buildTrackingWorkbook } from "@/lib/report/excel";
import { exportViewer, param, xlsxResponse } from "@/lib/report/export-response";

const STATUSES: TrackingStatusFilter[] = ["Vacancy", "Offer", "Pending"];
const BANDS: AgingBand[] = ["green", "orange", "red", "darkred"];

/** Excel export of the tracking page with its filters in the query string, scoped to the signed-in user. */
export async function GET(request: NextRequest) {
  const v = await exportViewer();
  if ("denied" in v) return v.denied;
  const repo = getRepo();
  const [requisitions, offers, log, branches, positions, users, settingRows] = await Promise.all([
    repo.list("Requisitions"),
    repo.list("Offers"),
    repo.list("StatusLog"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
    repo.list("Settings"),
  ]);
  const get = param(request.nextUrl.searchParams);
  // Same default as the page: a TA sees their own positions unless they switched to "ทั้งหมด".
  const mineOnly = v.user.role === "ta" && (get("mine") ?? "1") === "1";
  const rows = buildTrackingRows({ requisitions, offers, log, branches, positions, users, settings: parseSettings(settingRows) }, v.user, todayBangkok(), { mineOnly });
  const shown = filterTrackingRows(rows, {
    bu: get("bu"),
    region: get("region"),
    status: STATUSES.find((s) => s === get("status")),
    q: get("q"),
    band: BANDS.find((b) => b === get("band")),
    from: get("from"),
    to: get("to"),
    am: get("am"),
    rm: get("rm"),
    ta: get("ta"),
  });
  return xlsxResponse(await buildTrackingWorkbook(shown));
}
