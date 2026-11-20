import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { getSessionUser } from "@/lib/auth/session-user";
import { buildApprovalRows } from "@/lib/domain/queues";
import { evidenceHref } from "@/lib/evidence/store";
import { getRepo } from "@/lib/repo";
import { ApprovalsView } from "./approvals-view";

const TITLE = "อนุมัติ Cancel / Hold";
const DESCRIPTION = "คำขอยกเลิกหรือพักตำแหน่งจาก TA พร้อมรูปหลักฐาน ตำแหน่งจะหักออกจาก vacancy เมื่ออนุมัติแล้วเท่านั้น";

async function ApprovalsContent() {
  const user = await getSessionUser();
  if (user.role !== "super_admin") {
    return <p className="rounded-[1.75rem] bg-white/65 py-12 text-center text-muted-foreground ring-1 ring-black/5">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>;
  }
  const repo = getRepo();
  const [approvals, requisitions, branches, positions, users] = await Promise.all([
    repo.list("Approvals"),
    repo.list("Requisitions"),
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("Users"),
  ]);
  const rows = buildApprovalRows({ approvals, requisitions, branches, positions, users }, user).map((r) => ({ ...r, evidenceHref: evidenceHref(r.evidenceRef) }));
  return <ApprovalsView rows={rows} />;
}

export default function ApprovalsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <Suspense fallback={<p className="py-12 text-center text-muted-foreground">กำลังโหลดข้อมูล…</p>}>
        <ApprovalsContent />
      </Suspense>
    </div>
  );
}
