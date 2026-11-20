import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { findActiveUser } from "@/lib/domain/permissions";
import { readEvidence } from "@/lib/evidence/store";
import { getRepo } from "@/lib/repo";

/** Streams a Cancel/Hold evidence photo to any active, signed-in user. Photos are never public. */
export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !findActiveUser(await getRepo().list("Users"), email)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const ref = request.nextUrl.searchParams.get("ref");
  if (!ref) return new Response("Missing ref", { status: 400 });

  // Only refs that belong to an Approval row can be read, so the route can't be used to fetch arbitrary blobs.
  const approvals = await getRepo().list("Approvals");
  if (!approvals.some((a) => a.evidence_url === ref)) return new Response("Not found", { status: 404 });

  const file = await readEvidence(ref);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.body as BodyInit, {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
