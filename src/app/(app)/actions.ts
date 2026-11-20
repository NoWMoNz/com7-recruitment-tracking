"use server";

import { signOut } from "@/auth";
import { getSessionUser } from "@/lib/auth/session-user";
import { getRepo } from "@/lib/repo";
import type { TabName } from "@/lib/sheets/schema";

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

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
