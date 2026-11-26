import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { buildHiredRows } from "@/lib/domain/hired";
import { getRepo } from "@/lib/repo";
import { HiredView } from "./hired-view";

async function HiredContent() {
  const user = await getSessionUser();
  const repo = getRepo();
  const [newHires, requisitions, branches, positions, users] = await Promise.all([
    repo.list("NewHires"),
    repo.list("Requisitions"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
  ]);
  return <HiredView rows={buildHiredRows({ newHires, requisitions, branches, positions, users }, user)} />;
}

export default function HiredPage() {
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
      <HiredContent />
    </Suspense>
  );
}
