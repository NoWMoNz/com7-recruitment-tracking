"use server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getRepo } from "@/lib/repo";
import { runWithdrawal } from "@/lib/resign/withdraw";
import { writeError, type ActionResult } from "../action-utils";

/**
 * ยกเลิกลาออก. A Vacancy opened for this resignation is closed at once; an Offer or other open status goes to the
 * admin's review list; the resignation row records who withdrew it and why.
 */
export async function withdrawResignation(input: { rowNumber: number; employeeId: string; effectiveDate: string; note: string }): Promise<ActionResult> {
  const viewer = await getSessionUser();
  try {
    const res = await runWithdrawal(getRepo(), viewer, input);
    return res.ok ? { ok: true } : res;
  } catch (e) {
    return writeError(e);
  }
}
