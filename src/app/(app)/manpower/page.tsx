import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { todayBangkok } from "@/lib/domain/dates";
import { buildManpowerRows } from "@/lib/domain/manpower";
import { getRepo } from "@/lib/repo";
import { ManpowerView } from "./manpower-view";

async function ManpowerContent() {
  const user = await getSessionUser();
  const repo = getRepo();
  const [quota, requisitions, branches, positions, assignments, users] = await Promise.all([repo.list("Quota"), repo.list("Requisitions"), repo.list("Branches"), repo.list("Positions"), repo.list("RecruiterAssignments"), repo.list("Users")]);
  const { rows, closedBranches } = buildManpowerRows({ quota, requisitions, branches, positions, assignments, users }, user, todayBangkok());
  // The date of HR's report, so people know how old the figures are.
  const reportDate = quota.map((l) => l.report_date).filter(Boolean).sort().at(-1) ?? null;
  return <ManpowerView rows={rows} closedBranches={closedBranches} reportDate={reportDate} isAdmin={user.role === "super_admin"} />;
}

export default function ManpowerPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-busy>
          <div className="h-16 w-72 animate-pulse rounded-2xl bg-muted" />
          <div className="h-24 animate-pulse rounded-3xl bg-muted" />
          <div className="h-64 animate-pulse rounded-3xl bg-muted/70" />
        </div>
      }
    >
      <ManpowerContent />
    </Suspense>
  );
}
