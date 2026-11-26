import { Suspense } from "react";
import { ExportLink } from "@/components/export-link";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session-user";
import { todayBangkok } from "@/lib/domain/dates";
import { assignableUsers, BRANCH_STATUSES, keyOf } from "@/lib/domain/master";
import { normalizeEmail } from "@/lib/domain/permissions";
import { getRepo } from "@/lib/repo";
import { cn } from "@/lib/utils";
import { MasterTable, type Row } from "./master-table";
import { NewRequisitionForm } from "./new-requisition-form";

const TITLE = "Master Data";
const DESCRIPTION = "ข้อมูลหลักของระบบ: สาขา (รวมวันปิดร้าน) ตำแหน่งและ SLA, Sourcing Channel, การผูก Recruiter และการเพิ่มตำแหน่งที่ต้องสรรหา";

const TABS = [
  { tab: "requisitions", label: "เพิ่มตำแหน่ง" },
  { tab: "branches", label: "สาขา" },
  { tab: "positions", label: "ตำแหน่ง & SLA" },
  { tab: "channels", label: "Sourcing Channel" },
  { tab: "assignments", label: "ผูก Recruiter" },
] as const;
type Tab = (typeof TABS)[number]["tab"];

const rowsOf = <T extends object>(entity: Parameters<typeof keyOf>[0], items: T[]): Row[] =>
  items.map((x) => ({ ...(x as Record<string, Row[string]>), _key: keyOf(entity, x as Record<string, unknown>) }));

async function MasterContent({ tab }: { tab: Tab }) {
  const user = await getSessionUser();
  if (user.role !== "super_admin") {
    return <p className="rounded-[1.75rem] bg-white/65 py-12 text-center text-muted-foreground ring-1 ring-black/5">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>;
  }
  const repo = getRepo();
  const [branches, positions, channels, assignments, users, settings] = await Promise.all([
    repo.list("Branches"),
    repo.list("Positions"),
    repo.list("SourcingChannels"),
    repo.list("RecruiterAssignments"),
    repo.list("Users"),
    repo.list("Settings"),
  ]);
  const branchOptions = [...branches].sort((a, b) => a.branch_name.localeCompare(b.branch_name, "th")).map((b) => ({ value: b.branch_code, label: `${b.branch_name} (${b.branch_code})` }));
  const positionOptions = positions.map((p) => ({ value: p.position_code, label: p.position_name }));
  const taOptions = assignableUsers(users).map((u) => ({ value: normalizeEmail(u.email), label: `${u.name} (${u.email})` }));
  const regions = [...new Set(branches.map((b) => b.region).filter(Boolean))];
  const bus = [...new Set(branches.map((b) => b.bu).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  const groups = [...new Set(positions.map((p) => p.position_group).filter(Boolean))];
  const defaultSla = settings.find((s) => s.key === "default_sla_days")?.value || "30";

  switch (tab) {
    case "requisitions":
      return <NewRequisitionForm branches={branchOptions} positions={positionOptions} tas={taOptions} today={todayBangkok()} />;
    case "branches":
      return (
        <MasterTable
          entity="Branches"
          noun="สาขา"
          rows={rowsOf("Branches", branches)}
          columns={[
            { key: "branch_name", label: "สาขา" },
            { key: "branch_code", label: "", sub: true },
            { key: "bu", label: "BU" },
            { key: "brand", label: "", sub: true },
            { key: "region", label: "ภาค" },
            { key: "province", label: "จังหวัด" },
            { key: "am", label: "AM" },
            { key: "rm", label: "RM" },
            { key: "status", label: "สถานะ" },
            { key: "open_date", label: "วันเปิด", format: "date" },
            { key: "close_date", label: "วันปิดร้าน", format: "date" },
          ]}
          fields={[
            { name: "branch_code", label: "รหัสสาขา", type: "text", lockOnEdit: true, required: true, placeholder: "เช่น BKK-012" },
            { name: "branch_name", label: "ชื่อสาขา", type: "text", required: true },
            { name: "bu", label: "BU", type: "text", hint: bus.length ? `ที่มี: ${bus.join(", ")}` : "ตาม Group ใหญ่ ในไฟล์ HR เช่น Apple, BaNANA" },
            { name: "brand", label: "แบรนด์ (Group เล็ก)", type: "text" },
            { name: "region", label: "ภาค", type: "text", required: true, hint: regions.length ? `ที่มี: ${regions.join(", ")}` : undefined },
            { name: "province", label: "จังหวัด", type: "text" },
            { name: "am", label: "AM", type: "text", hint: "Area Manager ตามชีต Zone ในไฟล์ HR" },
            { name: "rm", label: "RM", type: "text", hint: "Regional Manager ตามชีต Zone ในไฟล์ HR" },
            { name: "status", label: "สถานะ", type: "select", required: true, options: BRANCH_STATUSES.map((s) => ({ value: s, label: s })) },
            { name: "open_date", label: "วันเปิดร้าน", type: "date" },
            { name: "close_date", label: "วันปิดร้าน", type: "date", hint: "ถึงวันนี้ ตำแหน่งที่ยังเปิดจะถูกยกเลิกอัตโนมัติ" },
          ]}
          blank={{ status: "Open" }}
        />
      );
    case "positions":
      return (
        <MasterTable
          entity="Positions"
          noun="ตำแหน่ง"
          rows={rowsOf("Positions", positions)}
          columns={[
            { key: "position_name", label: "ตำแหน่ง" },
            { key: "position_code", label: "", sub: true },
            { key: "position_group", label: "กลุ่มตำแหน่ง" },
            { key: "sla_days", label: `SLA (ค่าเริ่มต้น ${defaultSla} วัน)`, format: "days" },
          ]}
          fields={[
            { name: "position_code", label: "รหัสตำแหน่ง", type: "text", lockOnEdit: true, required: true },
            { name: "position_name", label: "ชื่อตำแหน่ง", type: "text", required: true },
            { name: "position_group", label: "กลุ่มตำแหน่ง", type: "text", hint: groups.length ? `ที่มี: ${groups.join(", ")}` : undefined },
            { name: "sla_days", label: "SLA (วัน)", type: "number", hint: `เว้นว่าง = ใช้ค่าเริ่มต้น ${defaultSla} วัน` },
          ]}
          blank={{}}
        />
      );
    case "channels":
      return (
        <MasterTable
          entity="SourcingChannels"
          noun="Channel"
          rows={rowsOf("SourcingChannels", channels)}
          columns={[
            { key: "channel", label: "Sourcing Channel" },
            { key: "active", label: "สถานะ", format: "bool" },
          ]}
          fields={[
            { name: "channel", label: "ชื่อ Channel", type: "text", lockOnEdit: true, required: true },
            { name: "active", label: "ใช้งาน (แสดงในตัวเลือกตอนกรอก Offer)", type: "checkbox" },
          ]}
          blank={{ active: "on" }}
        />
      );
    case "assignments": {
      const branchName = new Map(branches.map((b) => [b.branch_code, b.branch_name]));
      const userName = new Map(users.map((u) => [normalizeEmail(u.email), u.name]));
      const rows = rowsOf("RecruiterAssignments", assignments).map((r) => ({
        ...r,
        branch_label: `${branchName.get(String(r.branch_code)) ?? r.branch_code}`,
        group_label: r.position_group || "ทุกตำแหน่ง",
        ta_label: userName.get(normalizeEmail(String(r.ta_email))) ?? r.ta_email,
      }));
      return (
        <MasterTable
          entity="RecruiterAssignments"
          noun="การผูก Recruiter"
          rows={rows}
          deletable
          columns={[
            { key: "branch_label", label: "สาขา" },
            { key: "branch_code", label: "", sub: true },
            { key: "group_label", label: "กลุ่มตำแหน่ง" },
            { key: "ta_label", label: "TA" },
          ]}
          fields={[
            { name: "branch_code", label: "สาขา", type: "select", required: true, options: branchOptions, lockOnEdit: true },
            { name: "position_group", label: "กลุ่มตำแหน่ง", type: "select", options: groups.map((g) => ({ value: g, label: g })), lockOnEdit: true, hint: "เว้นว่าง = ทุกตำแหน่งของสาขา (แบบเจาะจงกลุ่มจะถูกใช้ก่อน)" },
            { name: "ta_email", label: "TA", type: "select", required: true, options: taOptions },
          ]}
          blank={{}}
        />
      );
    }
  }
}

export default async function MasterPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <div className="space-y-4">
      <PageHeader title={TITLE} description={DESCRIPTION} actions={<ExportLink href="/api/export/master" />} />
      <Suspense fallback={<p className="py-12 text-center text-muted-foreground">กำลังโหลดข้อมูล…</p>}>
        <MasterTabs searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MasterTabs({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.tab === sp.tab) ? (sp.tab as Tab) : "requisitions";
  return (
    <div className="space-y-4">
      <nav aria-label="ประเภทข้อมูล" className="flex flex-wrap gap-1 rounded-full bg-muted p-1 sm:w-fit">
        {TABS.map((t) => (
          <Link
            key={t.tab}
            href={`/master?tab=${t.tab}`}
            aria-current={tab === t.tab ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              tab === t.tab ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <MasterContent tab={tab} />
    </div>
  );
}
