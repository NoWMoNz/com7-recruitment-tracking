import "server-only";
import { randomUUID } from "node:crypto";
import { todayBangkok } from "@/lib/domain/dates";
import { planProcessing, type ImportTab, type ProcessorSummary } from "@/lib/domain/processor";
import { monthOf, previousMonth } from "@/lib/domain/report";
import { parseSettings } from "@/lib/domain/settings";
import { writeSnapshot } from "@/lib/report/snapshot";
import { getRepo, type Repo } from "@/lib/repo";

export const IMPORT_TABS: ImportTab[] = ["Import_Initial", "Import_Requisition", "Import_Resign", "Import_Transfer", "Import_NewEmployee"];

const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;

/**
 * Reads everything the processor needs (fresh, not cached), plans, then writes in batches: about 15 Sheets
 * calls per run however many rows there are. Requisition updates go first because their version check is
 * what stops a run from overwriting a change someone made in the web a moment earlier; on a conflict
 * nothing is written and the run can simply be repeated (the processor is idempotent).
 */
export type RunSummary = ProcessorSummary & { /** Month closed into MonthlySnapshots by this run, if any. */ closedMonth: string | null };

export async function runProcessor(actor: string, repo: Repo = getRepo()): Promise<RunSummary> {
  for (const tab of ["Requisitions", "Offers", "StatusLog", "Approvals", "NewHires", "ReviewQueue", "Branches"] as const) {
    await repo.invalidate(tab);
  }
  const [requisitions, offers, log, approvals, branches, positions, assignments, channels, newHires, reviewQueue, settingRows, initial, requisition, resign, transfer, newEmployee] =
    await Promise.all([
      repo.list("Requisitions"),
      repo.list("Offers"),
      repo.list("StatusLog"),
      repo.list("Approvals"),
      repo.list("Branches"),
      repo.list("Positions"),
      repo.list("RecruiterAssignments"),
      repo.list("SourcingChannels"),
      repo.list("NewHires"),
      repo.list("ReviewQueue"),
      repo.list("Settings"),
      repo.listNumbered("Import_Initial"),
      repo.listNumbered("Import_Requisition"),
      repo.listNumbered("Import_Resign"),
      repo.listNumbered("Import_Transfer"),
      repo.listNumbered("Import_NewEmployee"),
    ]);

  const today = todayBangkok();
  const now = new Date();
  const plan = planProcessing({
    today,
    now,
    actor,
    settings: parseSettings(settingRows),
    requisitions,
    offers,
    log,
    approvals,
    branches,
    positions,
    assignments,
    channels: channels.filter((c) => c.active).map((c) => c.channel),
    newHires,
    reviewQueue,
    imports: { initial, requisition, resign, transfer, newEmployee },
    newId,
  });

  await repo.updateMany("Requisitions", plan.reqUpdate);
  if (plan.reqAppend.length) await repo.append("Requisitions", plan.reqAppend);
  if (plan.offerAppend.length) await repo.append("Offers", plan.offerAppend);
  if (plan.newHireAppend.length) await repo.append("NewHires", plan.newHireAppend);
  for (const id of plan.offerRemove) await repo.remove("Offers", id);
  await repo.updateMany("Approvals", plan.approvalUpdate);
  if (plan.logAppend.length) await repo.append("StatusLog", plan.logAppend);
  if (plan.reviewAppend.length) await repo.append("ReviewQueue", plan.reviewAppend);
  for (const tab of IMPORT_TABS) await repo.updateAt(tab, plan.importMarks[tab]);

  // Period close: the first run of a month freezes last month's figures (once; later runs see the snapshot).
  const lastMonth = previousMonth(monthOf(today));
  const snaps = await repo.list("MonthlySnapshots");
  let closedMonth: string | null = null;
  if (!snaps.some((s) => String(s.month).trim() === lastMonth)) {
    if ((await writeSnapshot(repo, lastMonth, today, now.toISOString())) > 0) closedMonth = lastMonth;
  }

  return { ...plan.summary, closedMonth };
}
