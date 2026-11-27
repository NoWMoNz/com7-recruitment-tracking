import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { todayBangkok } from "@/lib/domain/dates";
import { branchLabel } from "@/lib/domain/people";
import { inScope } from "@/lib/domain/permissions";
import { buildResignRows } from "@/lib/domain/resign";
import { getRepo } from "@/lib/repo";
import { ResignationsView } from "./resignations-view";

async function ResignationsContent() {
  const user = await getSessionUser();
  const repo = getRepo();
  const [resign, requisitions, branches, positions, users] = await Promise.all([
    repo.listNumbered("Import_Resign", { cached: true }),
    repo.list("Requisitions"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
  ]);
  const rows = buildResignRows({ resign, requisitions, branches, positions, users }, user, todayBangkok());
  const canAdd = user.role !== "viewer";
  const branchOptions = branches
    .filter((b) => b.status !== "Closed" && inScope(user, b))
    .map((b) => ({ value: b.branch_code, label: branchLabel(b.branch_code, b) }))
    .sort((a, b) => a.label.localeCompare(b.label, "th"));
  const positionOptions = positions.map((p) => ({ value: p.position_code, label: p.position_name })).sort((a, b) => a.label.localeCompare(b.label, "th"));
  return <ResignationsView rows={rows} canAdd={canAdd} isAdmin={user.role === "super_admin"} branches={branchOptions} positions={positionOptions} />;
}

export default function ResignationsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-busy>
          <div className="h-16 w-72 animate-pulse rounded-2xl bg-muted" />
          <div className="h-16 animate-pulse rounded-3xl bg-muted" />
          <div className="h-64 animate-pulse rounded-3xl bg-muted/70" />
        </div>
      }
    >
      <ResignationsContent />
    </Suspense>
  );
}
