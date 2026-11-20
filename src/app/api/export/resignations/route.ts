import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { todayBangkok } from "@/lib/domain/dates";
import { findActiveUser } from "@/lib/domain/permissions";
import { buildResignRows, filterResignRows, type ResignState } from "@/lib/domain/resign";
import { getRepo } from "@/lib/repo";
import { buildResignationsWorkbook } from "@/lib/report/excel";

const STATES: ResignState[] = ["upcoming", "resigned", "withdrawn"];

/** Excel export of the resignation list with the page's filters in the query string, scoped to the signed-in user. */
export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  const repo = getRepo();
  const user = email ? findActiveUser(await repo.list("Users"), email) : null;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [resign, requisitions, branches, positions, users] = await Promise.all([
    repo.listNumbered("Import_Resign"),
    repo.list("Requisitions"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
  ]);
  const q = request.nextUrl.searchParams;
  const get = (k: string) => q.get(k)?.trim() || undefined;
  const state = STATES.find((s) => s === get("state"));
  const rows = filterResignRows(buildResignRows({ resign, requisitions, branches, positions, users }, user, todayBangkok()), {
    bu: get("bu"),
    region: get("region"),
    state,
    from: get("from"),
    to: get("to"),
    q: get("q"),
  });
  const { buffer, filename } = await buildResignationsWorkbook(rows);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
