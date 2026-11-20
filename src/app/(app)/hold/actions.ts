"use server";

import { getSessionUser } from "@/lib/auth/session-user";
import { planResume } from "@/lib/domain/approval";
import { todayBangkok } from "@/lib/domain/dates";
import { parseSettings } from "@/lib/domain/settings";
import { getRepo } from "@/lib/repo";
import { CONFLICT, fail, GONE, newId, writeError, type ActionResult } from "../action-utils";

/** Hold -> Vacancy. TAT resumes from where it stopped; the hold period stays excluded. */
export async function resumeHold(reqId: string, expectedVersion: number, date: string): Promise<ActionResult> {
  const viewer = await getSessionUser();
  const repo = getRepo();
  const [req, settingRows, log] = await Promise.all([repo.getFresh("Requisitions", reqId), repo.list("Settings"), repo.list("StatusLog")]);
  if (!req) return fail(GONE);
  if (req.version !== expectedVersion) return fail(CONFLICT);

  const plan = planResume({
    req,
    input: { date },
    log,
    viewer,
    today: todayBangkok(),
    settings: parseSettings(settingRows),
    ids: { logId: newId("LOG") },
    now: new Date(),
  });
  if (!plan.ok) return plan;

  try {
    await repo.update("Requisitions", req.id, plan.value.reqPatch, expectedVersion);
    await repo.append("StatusLog", [plan.value.logEntry]);
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}
