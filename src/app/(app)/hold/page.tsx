import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { todayBangkok } from "@/lib/domain/dates";
import { earliestDate } from "@/lib/domain/offer";
import { buildHoldRows } from "@/lib/domain/queues";
import { parseSettings } from "@/lib/domain/settings";
import { getRepo } from "@/lib/repo";
import { HoldView } from "./hold-view";

async function HoldContent() {
  const user = await getSessionUser();
  const repo = getRepo();
  const [requisitions, approvals, log, branches, positions, users, settingRows] = await Promise.all([
    repo.list("Requisitions"),
    repo.list("Approvals"),
    repo.list("StatusLog"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
    repo.list("Settings"),
  ]);
  const today = todayBangkok();
  const settings = parseSettings(settingRows);
  const rows = buildHoldRows({ requisitions, approvals, log, branches, positions, users }, user, today);
  return (
    <HoldView
      rows={rows}
      today={today}
      minDate={earliestDate(today, settings.backdateDays, user.role)}
      backdateDays={settings.backdateDays}
      bands={settings.agingBands}
    />
  );
}

export default function HoldPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-busy>
          <div className="h-16 w-80 animate-pulse rounded-2xl bg-muted" />
          <div className="h-56 animate-pulse rounded-3xl bg-muted/70" />
        </div>
      }
    >
      <HoldContent />
    </Suspense>
  );
}
