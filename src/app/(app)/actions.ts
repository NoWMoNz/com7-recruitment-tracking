"use server";

import { signOut } from "@/auth";
import { planPasswordChange } from "@/lib/auth/password";
import { getSessionUser } from "@/lib/auth/session-user";
import { getRepo } from "@/lib/repo";
import type { TabName } from "@/lib/sheets/schema";
import { writeError, type ActionResult } from "./action-utils";

const TRACKING_TABS: TabName[] = [
  "Requisitions",
  "Offers",
  "Turndowns",
  "Approvals",
  "StatusLog",
  "Branches",
  "Positions",
  "Users",
  "Settings",
  "SourcingChannels",
];

/** Drop cached Sheet data so edits made directly in Google Sheets show up now. */
export async function refreshData(): Promise<void> {
  await getSessionUser();
  const repo = getRepo();
  await Promise.all(TRACKING_TABS.map((t) => repo.invalidate(t)));
}

/** The signed-in person changes their own name + password sign-in; the current password must be right. */
export async function changeOwnPassword(input: { current: string; next: string; confirm: string }): Promise<ActionResult> {
  const viewer = await getSessionUser();
  const repo = getRepo();
  try {
    const plan = await planPasswordChange(await repo.listNumbered("Logins"), viewer.email, {
      current: String(input.current ?? ""),
      next: String(input.next ?? ""),
      confirm: String(input.confirm ?? ""),
    });
    if (!plan.ok) return plan;
    await repo.updateAt("Logins", [{ rowNumber: plan.rowNumber, patch: { password_hash: plan.password_hash } }]);
    await repo.invalidate("Logins");
  } catch (e) {
    return writeError(e);
  }
  return { ok: true };
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
