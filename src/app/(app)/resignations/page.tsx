import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { todayBangkok } from "@/lib/domain/dates";
import { buildResignRows } from "@/lib/domain/resign";
import { getRepo } from "@/lib/repo";
import { ResignationsView } from "./resignations-view";

async function ResignationsContent() {
  const user = await getSessionUser();
  const repo = getRepo();
  const [resign, requisitions, branches, positions, users] = await Promise.all([
    repo.listNumbered("Import_Resign"),
    repo.list("Requisitions"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
  ]);
  const rows = buildResignRows({ resign, requisitions, branches, positions, users }, user, todayBangkok());
  return <ResignationsView rows={rows} />;
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
