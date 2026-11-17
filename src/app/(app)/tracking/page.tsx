import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { todayBangkok } from "@/lib/domain/dates";
import { parseSettings } from "@/lib/domain/settings";
import { buildTrackingRows } from "@/lib/domain/tracking";
import { getRepo } from "@/lib/repo";
import { TrackingView } from "./tracking-view";

async function TrackingContent({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);
  const repo = getRepo();
  const [requisitions, offers, log, branches, positions, users, settingRows] = await Promise.all([
    repo.list("Requisitions"),
    repo.list("Offers"),
    repo.list("StatusLog"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
    repo.list("Settings"),
  ]);

  const canFilterMine = user.role === "ta";
  const mineOnly = canFilterMine && (params.mine ?? "1") === "1";
  const today = todayBangkok();
  const rows = buildTrackingRows(
    { requisitions, offers, log, branches, positions, users, settings: parseSettings(settingRows) },
    user,
    today,
    { mineOnly },
  );

  return <TrackingView rows={rows} today={today} mineOnly={mineOnly} canFilterMine={canFilterMine} />;
}

export default function TrackingPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">ตำแหน่งที่กำลังสรรหา</h1>
        <p className="text-sm text-muted-foreground">แสดงเฉพาะตำแหน่งที่ยังดำเนินการอยู่ (ว่าง / Offer แล้ว / รออนุมัติ)</p>
      </div>
      <Suspense fallback={<p className="py-12 text-center text-muted-foreground">กำลังโหลดข้อมูล…</p>}>
        <TrackingContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
