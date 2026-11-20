import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { findActiveUser } from "@/lib/domain/permissions";
import { getRepo } from "@/lib/repo";
import { buildWorkbook } from "@/lib/report/excel";
import { loadReport, parseReportParams } from "@/lib/report/load";

/** Excel export of the report tab and filters in the query string, scoped to the signed-in user. */
export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  const user = email ? findActiveUser(await getRepo().list("Users"), email) : null;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const params = parseReportParams(Object.fromEntries(request.nextUrl.searchParams));
  const { buffer, filename } = await buildWorkbook(await loadReport(user, params));
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
