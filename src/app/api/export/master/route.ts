import type { NextRequest } from "next/server";
import type { MasterEntity } from "@/lib/domain/master";
import { getRepo } from "@/lib/repo";
import { buildMasterWorkbook } from "@/lib/report/excel";
import { exportViewer, param, xlsxResponse } from "@/lib/report/export-response";

const ENTITIES: MasterEntity[] = ["Branches", "Positions", "SourcingChannels", "RecruiterAssignments", "Users"];

/**
 * Excel export of master data, one sheet per tab (super_admin only, like the pages). `?tab=Users` gives that tab
 * alone (the Users page). Sign-in passwords (the Logins tab) are never exported.
 */
export async function GET(request: NextRequest) {
  const v = await exportViewer({ adminOnly: true });
  if ("denied" in v) return v.denied;
  const only = ENTITIES.find((e) => e === param(request.nextUrl.searchParams)("tab"));
  const repo = getRepo();
  const tabs = await Promise.all((only ? [only] : ENTITIES).map(async (tab) => ({ tab, rows: (await repo.list(tab)) as object[] })));
  return xlsxResponse(await buildMasterWorkbook(tabs));
}
