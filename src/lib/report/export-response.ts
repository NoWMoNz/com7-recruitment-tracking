import "server-only";
import { auth } from "@/auth";
import { findActiveUser } from "@/lib/domain/permissions";
import type { User } from "@/lib/domain/types";
import { getRepo } from "@/lib/repo";

/** The signed-in, active user for an export route; null means answer 401. `adminOnly` also refuses anyone but super_admin. */
export async function exportViewer(opts: { adminOnly?: boolean } = {}): Promise<{ user: User } | { denied: Response }> {
  const session = await auth();
  const email = session?.user?.email;
  const user = email ? findActiveUser(await getRepo().list("Users"), email) : null;
  if (!user) return { denied: new Response("Unauthorized", { status: 401 }) };
  if (opts.adminOnly && user.role !== "super_admin") return { denied: new Response("Forbidden", { status: 403 }) };
  return { user };
}

export function xlsxResponse({ buffer, filename }: { buffer: ArrayBuffer; filename: string }): Response {
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** A query-string reader that drops blanks. */
export const param = (q: URLSearchParams) => (k: string) => q.get(k)?.trim() || undefined;
