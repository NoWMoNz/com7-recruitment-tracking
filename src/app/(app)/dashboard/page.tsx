import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session-user";
import { buildTrend } from "@/lib/domain/dashboard";
import { todayBangkok } from "@/lib/domain/dates";
import { inScope } from "@/lib/domain/permissions";
import { buildApprovalRows, buildHoldRows } from "@/lib/domain/queues";
import { filtered } from "@/lib/domain/report";
import { parseSettings } from "@/lib/domain/settings";
import { buildTrackingRows } from "@/lib/domain/tracking";
import { getRepo } from "@/lib/repo";
import { PageHeader } from "@/components/page-header";
import { DashboardView } from "./dashboard-view";

const TITLE = "Dashboard ภาพรวม";
const DESCRIPTION = "สรุปตำแหน่งว่าง Offer และผลลัพธ์ TAT ของทีมสรรหา แยกตามภาคและผู้รับผิดชอบ";

async function DashboardContent() {
  const user = await getSessionUser();
  const repo = getRepo();
  const [requisitions, offers, log, branches, positions, users, settingRows, approvals, turndowns, newHires] = await Promise.all([
    repo.list("Requisitions"),
    repo.list("Offers"),
    repo.list("StatusLog"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
    repo.list("Settings"),
    repo.list("Approvals"),
    repo.list("Turndowns"),
    repo.list("NewHires"),
  ]);

  const today = todayBangkok();
  const settings = parseSettings(settingRows);
  const rows = buildTrackingRows({ requisitions, offers, log, branches, positions, users, settings }, user, today, { mineOnly: false });

  const lookups = { requisitions, branches, positions, users };
  const approvalRows = buildApprovalRows({ ...lookups, approvals }, user).map((a) => ({
    id: a.id,
    type: a.type,
    region: a.region,
    province: a.province,
    branchName: a.branchName,
    positionName: a.positionName,
    by: a.requestedBy,
    since: a.requestedAt.slice(0, 10),
  }));
  const holdRows = buildHoldRows({ ...lookups, approvals, log }, user, today).map((h) => ({
    id: h.reqId,
    region: h.region,
    province: h.province,
    branchName: h.branchName,
    positionName: h.positionName,
    taName: h.taName,
    days: h.daysHeld,
  }));

  const reqs = filtered({ requisitions, log, branches, positions, users, settings }, user, {});
  const trend = buildTrend({ requisitions, log, branches, positions, users, settings, offers: [...newHires, ...turndowns, ...offers] }, reqs, today, 12);

  // Hired this month, as the region of each hire so the region tabs can filter it too.
  const month = today.slice(0, 7);
  const branchByCode = new Map(branches.map((b) => [b.branch_code, b]));
  const hiredRegions = requisitions
    .filter((r) => r.status === "Hired" && r.closed_at?.startsWith(month))
    .flatMap((r) => {
      const b = branchByCode.get(r.branch_code);
      return b && inScope(user, b) ? [b.region || "ไม่ระบุ"] : [];
    });

  const turndownRegions = turndowns
    .filter((t) => t.turndown_date.startsWith(month))
    .flatMap((t) => {
      const r = requisitions.find((x) => x.id === t.req_id);
      const b = r && branchByCode.get(r.branch_code);
      return b && inScope(user, b) ? [b.region || "ไม่ระบุ"] : [];
    });

  return (
    <DashboardView
      rows={rows}
      hiredRegions={hiredRegions}
      turndownRegions={turndownRegions}
      trend={trend}
      approvals={approvalRows}
      holds={holdRows}
      today={today}
      isAdmin={user.role === "super_admin"}
      title={TITLE}
      description={DESCRIPTION}
    />
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <PageHeader title={TITLE} description={DESCRIPTION} />
          <p className="rounded-[1.75rem] bg-white/65 py-12 text-center text-muted-foreground ring-1 ring-white/80">กำลังโหลดข้อมูล…</p>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
