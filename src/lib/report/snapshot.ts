import "server-only";
import { monthlyRows, toSnapshot } from "@/lib/domain/report";
import { parseSettings } from "@/lib/domain/settings";
import type { LocalDate } from "@/lib/domain/types";
import type { Repo } from "@/lib/repo";

/**
 * Computes `month` for every requisition (no viewer scope: snapshots are company-wide, split by TA and
 * region) and appends it to MonthlySnapshots. Reports use the newest computed_at of a month, so a
 * recompute simply appends a newer set. Returns the number of rows written.
 */
export async function writeSnapshot(repo: Repo, month: string, today: LocalDate, computedAt: string): Promise<number> {
  const [requisitions, log, branches, positions, users, settingRows, offers, turndowns, newHires] = await Promise.all([
    repo.list("Requisitions"),
    repo.list("StatusLog"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
    repo.list("Settings"),
    repo.list("Offers"),
    repo.list("Turndowns"),
    repo.list("NewHires"),
  ]);
  const rows = monthlyRows(
    { requisitions, log, branches, positions, users, settings: parseSettings(settingRows), offers: [...newHires, ...turndowns, ...offers] },
    requisitions,
    month,
    today,
  );
  const snapshot = toSnapshot(rows, month, computedAt);
  if (snapshot.length) await repo.append("MonthlySnapshots", snapshot);
  return snapshot.length;
}
