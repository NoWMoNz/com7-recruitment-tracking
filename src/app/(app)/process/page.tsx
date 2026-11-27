import { Suspense } from "react";
import { ExportLink } from "@/components/export-link";
import { PageHeader } from "@/components/page-header";
import { getSessionUser } from "@/lib/auth/session-user";
import { formatThaiDate } from "@/lib/domain/dates";
import { branchLabel } from "@/lib/domain/people";
import { inScope } from "@/lib/domain/permissions";
import { IMPORT_TABS } from "@/lib/processor/run";
import { getRepo } from "@/lib/repo";
import { ProcessView, type OfferOption, type ReviewView } from "./process-view";

const TITLE = "ประมวลผลข้อมูล";
const DESCRIPTION = "นำข้อมูลที่วางในแท็บ Import (ลาออก โอนย้าย พนักงานใหม่ ร้านเปิด ข้อมูลตั้งต้น) และร้านที่ถึงวันปิด มาปรับสถานะตำแหน่ง ระบบรันให้อัตโนมัติทุกคืน 00:30 น.";

const TAB_LABEL: Record<(typeof IMPORT_TABS)[number], string> = {
  Import_Initial: "ข้อมูลตั้งต้น",
  Import_Requisition: "ร้านเปิด / เพิ่มอัตรา",
  Import_Resign: "ลาออก",
  Import_Transfer: "โอนย้าย",
  Import_NewEmployee: "พนักงานใหม่",
};

async function ProcessContent() {
  const user = await getSessionUser();
  if (user.role !== "super_admin") {
    return <p className="rounded-[1.75rem] bg-white/65 py-12 text-center text-muted-foreground ring-1 ring-black/5">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>;
  }
  const repo = getRepo();
  const [imports, reviews, offers, requisitions, branches, positions] = await Promise.all([
    Promise.all(IMPORT_TABS.map((t) => repo.listNumbered(t))),
    repo.list("ReviewQueue"),
    repo.list("Offers"),
    repo.list("Requisitions"),
    repo.list("Branches"),
    repo.list("Positions"),
  ]);

  const pending = IMPORT_TABS.map((tab, i) => ({
    tab,
    label: TAB_LABEL[tab],
    count: imports[i].filter((r) => !String((r.row as { processed_at?: string }).processed_at ?? "").trim()).length,
  }));

  const branchBy = new Map(branches.map((b) => [b.branch_code, b]));
  const positionBy = new Map(positions.map((p) => [p.position_code, p]));
  const reqBy = new Map(requisitions.map((r) => [r.id, r]));
  const offerOptions: OfferOption[] = offers
    .filter((o) => {
      const r = reqBy.get(o.req_id);
      const b = r && branchBy.get(r.branch_code);
      return r?.status === "Offer" && r.offer_id === o.id && (!b || inScope(user, b));
    })
    .map((o) => {
      const r = reqBy.get(o.req_id)!;
      return {
        id: o.id,
        branchCode: r.branch_code,
        positionCode: r.position_code,
        label: `${o.title}${o.first_name} ${o.last_name} · ${positionBy.get(r.position_code)?.position_name ?? r.position_code} · ${branchLabel(r.branch_code, branchBy.get(r.branch_code))} · Offer ${formatThaiDate(o.offer_date)}`,
      };
    });

  // For unmatched hires, the matching branch/position comes from the Import row the review points at.
  const newEmployeeRows = imports[IMPORT_TABS.indexOf("Import_NewEmployee")] as { rowNumber: number; row: { branch_code: string; position_code: string } }[];
  const openReviews: ReviewView[] = reviews
    .filter((r) => !r.resolved_at)
    .map((r) => {
      const m = r.type === "UnmatchedHire" ? /^NEW:r(\d+):/.exec(r.ref) : null;
      const src = m ? newEmployeeRows.find((x) => x.rowNumber === Number(m[1]))?.row : undefined;
      return { id: r.id, type: r.type, detail: r.detail, branchCode: src?.branch_code ?? null, positionCode: src?.position_code ?? null };
    });

  return <ProcessView pending={pending} reviews={openReviews} offers={offerOptions} />;
}

export default function ProcessPage() {
  return (
    <div className="space-y-4">
      <PageHeader title={TITLE} description={DESCRIPTION} actions={<ExportLink href="/api/export/reviews" />} />
      <Suspense fallback={<p className="py-12 text-center text-muted-foreground">กำลังโหลดข้อมูล…</p>}>
        <ProcessContent />
      </Suspense>
    </div>
  );
}
