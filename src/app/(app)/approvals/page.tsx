import { Suspense } from "react";
import { ExportLink } from "@/components/export-link";
import { PageHeader } from "@/components/page-header";
import { getSessionUser } from "@/lib/auth/session-user";
import { todayBangkok } from "@/lib/domain/dates";
import { buildApprovalRows, buildApprovalStatusRows, type ApprovalStatusRow } from "@/lib/domain/queues";
import type { ApprovalStatus } from "@/lib/domain/types";
import { evidenceHref } from "@/lib/evidence/store";
import { getRepo } from "@/lib/repo";
import { cn } from "@/lib/utils";
import { ApprovalsView } from "./approvals-view";

const TITLE = "อนุมัติ Cancel / Hold";
const DESCRIPTION = "คำขอยกเลิกหรือพักตำแหน่งจาก TA พร้อมรูปหลักฐาน ตำแหน่งจะหักออกจาก vacancy เมื่ออนุมัติแล้วเท่านั้น";
const STATUS_TITLE = "สถานะคำขอ Cancel / Hold";
const STATUS_DESCRIPTION = "คำขอที่รออนุมัติ และที่ผู้ดูแลระบบตัดสินแล้วใน 30 วันที่ผ่านมา";

const STATUS: Record<ApprovalStatus, { label: string; chip: string }> = {
  Pending: { label: "รออนุมัติ", chip: "bg-amber-100 text-amber-900" },
  Approved: { label: "อนุมัติแล้ว", chip: "bg-emerald-100 text-emerald-900" },
  Rejected: { label: "ไม่อนุมัติ", chip: "bg-black/[0.06] text-foreground/70" },
};

/** An admin's view of the requests: what was asked for which position, and where it stands. Nothing to open or press. */
function ApprovalStatusList({ rows }: { rows: ApprovalStatusRow[] }) {
  if (!rows.length) return <p className="rounded-[1.75rem] bg-white/65 py-12 text-center text-muted-foreground ring-1 ring-black/5">ไม่มีคำขอ</p>;
  return (
    <ul className="divide-y divide-black/[0.05] rounded-[1.75rem] bg-white/80 ring-1 ring-black/5">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5">
          <span className="w-16 shrink-0 text-sm text-muted-foreground">ขอ{r.type === "Cancel" ? "ยกเลิก" : "พัก"}</span>
          <span className="min-w-0 flex-1 text-sm">
            {r.positionName} · {r.branchName}
          </span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", STATUS[r.status].chip)}>{STATUS[r.status].label}</span>
        </li>
      ))}
    </ul>
  );
}

async function ApprovalsContent() {
  const user = await getSessionUser();
  if (user.role !== "super_admin" && user.role !== "admin") {
    return (
      <>
        <PageHeader title={TITLE} />
        <p className="rounded-[1.75rem] bg-white/65 py-12 text-center text-muted-foreground ring-1 ring-black/5">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
      </>
    );
  }
  const repo = getRepo();
  const [approvals, requisitions, branches, positions, users] = await Promise.all([
    repo.list("Approvals"),
    repo.list("Requisitions"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
  ]);
  const data = { approvals, requisitions, branches, positions, users };
  if (user.role === "admin") {
    return (
      <>
        <PageHeader title={STATUS_TITLE} description={STATUS_DESCRIPTION} />
        <ApprovalStatusList rows={buildApprovalStatusRows(data, user, todayBangkok())} />
      </>
    );
  }
  const rows = buildApprovalRows(data, user).map((r) => ({ ...r, evidenceHref: evidenceHref(r.evidenceRef) }));
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} actions={<ExportLink href="/api/export/approvals" />} />
      <ApprovalsView rows={rows} />
    </>
  );
}

export default function ApprovalsPage() {
  return (
    <div className="space-y-4">
      <Suspense
        fallback={
          <>
            <PageHeader title="งานรอจัดการ" />
            <p className="py-12 text-center text-muted-foreground">กำลังโหลดข้อมูล…</p>
          </>
        }
      >
        <ApprovalsContent />
      </Suspense>
    </div>
  );
}
