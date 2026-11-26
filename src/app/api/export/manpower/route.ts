import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { todayBangkok } from "@/lib/domain/dates";
import { buildManpowerRows, filterManpowerRows, type ManpowerStatus } from "@/lib/domain/manpower";
import { findActiveUser } from "@/lib/domain/permissions";
import { getRepo } from "@/lib/repo";
import { buildManpowerWorkbook } from "@/lib/report/excel";

const STATUSES: ManpowerStatus[] = ["short", "over", "full"];

/** Excel export of the manpower list with the page's filters in the query string, scoped to the signed-in user. */
export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  const repo = getRepo();
  const user = email ? findActiveUser(await repo.list("Users"), email) : null;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [quota, requisitions, branches, positions, assignments, users] = await Promise.all([repo.list("Quota"), repo.list("Requisitions"), repo.list("Branches"), repo.list("Positions"), repo.list("RecruiterAssignments"), repo.list("Users")]);
  const q = request.nextUrl.searchParams;
  const get = (k: string) => q.get(k)?.trim() || undefined;
  const { rows } = buildManpowerRows({ quota, requisitions, branches, positions, assignments, users }, user, todayBangkok());
  const { buffer, filename } = await buildManpowerWorkbook(
    filterManpowerRows(rows, { bu: get("bu"), region: get("region"), status: STATUSES.find((s) => s === get("status")), q: get("q"), am: get("am"), rm: get("rm"), ta: get("ta") }),
  );
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
