import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { todayBangkok } from "@/lib/domain/dates";
import { assignableUsers } from "@/lib/domain/master";
import { earliestDate } from "@/lib/domain/offer";
import { normalizeEmail } from "@/lib/domain/permissions";
import { parseSettings } from "@/lib/domain/settings";
import { buildTrackingRows } from "@/lib/domain/tracking";
import { getRepo } from "@/lib/repo";
import { TrackingView } from "./tracking-view";

const BAND_VALUES = ["green", "orange", "red", "darkred"] as const;

async function TrackingContent({ searchParams }: { searchParams: Promise<{ mine?: string; band?: string; q?: string; bu?: string }> }) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);
  const repo = getRepo();
  const [requisitions, offers, log, branches, positions, users, settingRows, channelRows] = await Promise.all([
    repo.list("Requisitions"),
    repo.list("Offers"),
    repo.list("StatusLog"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
    repo.list("Settings"),
    repo.list("SourcingChannels"),
  ]);

  const settings = parseSettings(settingRows);
  const canFilterMine = user.role === "ta";
  const mineOnly = canFilterMine && (params.mine ?? "1") === "1";
  const today = todayBangkok();
  const rows = buildTrackingRows(
    { requisitions, offers, log, branches, positions, users, settings },
    user,
    today,
    { mineOnly },
  );

  const editContext = {
    today,
    minDate: earliestDate(today, settings.backdateDays, user.role),
    backdateDays: settings.backdateDays,
    channels: channelRows.filter((c) => c.active).map((c) => c.channel),
    isAdmin: user.role === "super_admin",
    assignable: assignableUsers(users).map((x) => ({ value: normalizeEmail(x.email), label: x.name })),
  };

  const initialBand = BAND_VALUES.find((b) => b === params.band) ?? null;

  const initialQ = (params.q ?? "").slice(0, 80);
  const initialBu = (params.bu ?? "").slice(0, 60);

  // Keyed by the preset so a link from the dashboard replaces the filters instead of keeping the old ones.
  return (
    <TrackingView
      key={`${initialBand ?? ""}|${initialQ}|${initialBu}|${mineOnly}`}
      rows={rows}
      today={today}
      mineOnly={mineOnly}
      canFilterMine={canFilterMine}
      editContext={editContext}
      initialBand={initialBand}
      initialQ={initialQ}
      initialBu={initialBu}
    />
  );
}

function TrackingSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="h-16 w-72 animate-pulse rounded-2xl bg-muted" />
      <div className="h-28 animate-pulse rounded-3xl bg-muted" />
      <div className="h-64 animate-pulse rounded-3xl bg-muted/70" />
    </div>
  );
}

export default function TrackingPage({ searchParams }: { searchParams: Promise<{ mine?: string; band?: string; q?: string; bu?: string }> }) {
  return (
    <Suspense fallback={<TrackingSkeleton />}>
      <TrackingContent searchParams={searchParams} />
    </Suspense>
  );
}
