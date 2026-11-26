import { Suspense } from "react";
import { ExportLink } from "@/components/export-link";
import { PageHeader } from "@/components/page-header";
import { getSessionUser } from "@/lib/auth/session-user";
import { keyOf, ROLES } from "@/lib/domain/master";
import { normalizeEmail } from "@/lib/domain/permissions";
import { getRepo } from "@/lib/repo";
import { LoginPanel } from "./login-panel";
import { MasterTable, type Row } from "../master/master-table";

const TITLE = "กำหนดสิทธิ์ผู้ใช้";
const DESCRIPTION = "ใครเข้าระบบได้ (ต้องมีชื่อในรายการนี้และเปิดใช้งาน) สิทธิ์ และขอบเขตที่มองเห็น การเปลี่ยนมีผลทันทีโดยไม่ต้องออกจากระบบ";
const ROLE_LABEL: Record<(typeof ROLES)[number], string> = { super_admin: "ผู้ดูแลระบบ (super_admin)", ta: "TA", viewer: "ผู้ดูรายงาน (viewer)" };

async function UsersContent() {
  const viewer = await getSessionUser();
  if (viewer.role !== "super_admin") {
    return <p className="rounded-[1.75rem] bg-white/65 py-12 text-center text-muted-foreground ring-1 ring-black/5">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>;
  }
  const repo = getRepo();
  const [users, branches] = await Promise.all([repo.list("Users"), repo.list("Branches")]);
  // A missing Logins tab (sheet not set up yet) just means no name + password sign-ins so far.
  const logins = await repo.list("Logins").catch(() => []);
  const roleOf = new Map(users.map((u) => [normalizeEmail(u.email), ROLE_LABEL[u.role] ?? u.role]));
  const regions = [...new Set(branches.map((b) => b.region).filter(Boolean))];
  const rows: Row[] = users
    .map((u) => ({ ...u, role_label: ROLE_LABEL[u.role] ?? u.role, scope_label: u.scope || "ทั้งหมด", _key: keyOf("Users", u as unknown as Record<string, unknown>) }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "th"));

  return (
    <div className="space-y-4">
    <MasterTable
      entity="Users"
      noun="ผู้ใช้"
      rows={rows}
      columns={[
        { key: "name", label: "ชื่อ" },
        { key: "email", label: "", sub: true },
        { key: "role_label", label: "สิทธิ์" },
        { key: "scope_label", label: "ขอบเขตที่เห็น" },
        { key: "active", label: "สถานะ", format: "bool" },
      ]}
      fields={[
        { name: "email", label: "อีเมล (บัญชี Google ที่ใช้ล็อกอิน)", type: "email", lockOnEdit: true, required: true },
        { name: "name", label: "ชื่อที่แสดง", type: "text", required: true },
        { name: "role", label: "สิทธิ์", type: "select", required: true, options: ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })) },
        { name: "scope", label: "ขอบเขตที่เห็น", type: "text", hint: `เว้นว่าง = ทั้งหมด หรือใส่ภาค/รหัสสาขา คั่นด้วย , (ภาคที่มี: ${regions.join(", ")})` },
        { name: "active", label: "เปิดใช้งาน (ปิด = เข้าระบบไม่ได้)", type: "checkbox" },
      ]}
      blank={{ role: "ta", active: "on" }}
      deletable
    />
    {/* Only names and emails go to the browser, never the hashes. */}
    <LoginPanel
      logins={logins.map((l) => ({ username: l.username, role: roleOf.get(normalizeEmail(l.email)) ?? "ไม่พบผู้ใช้ในตารางด้านบน" }))}
      roles={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
    />
    </div>
  );
}

export default function UsersPage() {
  return (
    <div className="space-y-4">
      <PageHeader title={TITLE} description={DESCRIPTION} actions={<ExportLink href="/api/export/master?tab=Users" />} />
      <Suspense fallback={<p className="py-12 text-center text-muted-foreground">กำลังโหลดข้อมูล…</p>}>
        <UsersContent />
      </Suspense>
    </div>
  );
}
