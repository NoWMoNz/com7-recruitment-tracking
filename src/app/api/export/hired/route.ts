import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { buildHiredRows, filterHiredRows } from "@/lib/domain/hired";
import { findActiveUser } from "@/lib/domain/permissions";
import { getRepo } from "@/lib/repo";
import { buildHiredWorkbook } from "@/lib/report/excel";

/** Excel export of the Hired list with the page's filters in the query string, scoped to the signed-in user. */
export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  const repo = getRepo();
  const user = email ? findActiveUser(await repo.list("Users"), email) : null;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [newHires, requisitions, branches, positions, users] = await Promise.all([
    repo.list("NewHires"),
    repo.list("Requisitions"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
  ]);
  const q = request.nextUrl.searchParams;
  const get = (k: string) => q.get(k)?.trim() || undefined;
  const rows = filterHiredRows(buildHiredRows({ newHires, requisitions, branches, positions, users }, user), {
    bu: get("bu"),
    region: get("region"),
    from: get("from"),
    to: get("to"),
    q: get("q"),
    am: get("am"),
    rm: get("rm"),
    ta: get("ta"),
  });
  const { buffer, filename } = await buildHiredWorkbook(rows);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
