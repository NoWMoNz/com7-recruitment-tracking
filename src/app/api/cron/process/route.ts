import { timingSafeEqual } from "node:crypto";
import { runProcessor } from "@/lib/processor/run";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Anything else is refused. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const summary = await runProcessor("system");
    console.info("[cron] processor", JSON.stringify({ ...summary, skipped: summary.skipped.length }));
    return Response.json({ ok: true, summary });
  } catch (e) {
    console.error("[cron] processor failed", e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
