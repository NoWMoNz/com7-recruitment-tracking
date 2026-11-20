"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FileBarChart, LayoutDashboard, PauseCircle, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Page {
  href: string;
  label: string;
}
interface Group {
  /** Rail label; the first page is where the rail item leads. */
  label: string;
  icon: LucideIcon;
  pages: Page[];
  adminOnly?: boolean;
}

/** One rail item per group; pages that belong together share it and switch with tabs at the top of the page. */
const GROUPS: Group[] = [
  { label: "Dashboard ภาพรวม", icon: LayoutDashboard, pages: [{ href: "/dashboard", label: "Dashboard ภาพรวม" }] },
  {
    label: "ติดตามการสรรหา",
    icon: ClipboardList,
    pages: [
      { href: "/tracking", label: "ติดตามการสรรหา" },
      { href: "/manpower", label: "กำลังพล" },
    ],
  },
  {
    label: "Hold และลาออก",
    icon: PauseCircle,
    pages: [
      { href: "/hold", label: "ตำแหน่งที่พักไว้ (Hold)" },
      { href: "/resignations", label: "รายชื่อลาออก" },
    ],
  },
  { label: "Reports", icon: FileBarChart, pages: [{ href: "/reports", label: "Reports" }] },
  {
    label: "งานรอจัดการ",
    icon: ShieldCheck,
    adminOnly: true,
    pages: [
      { href: "/approvals", label: "อนุมัติ Cancel / Hold" },
      { href: "/process", label: "ประมวลผลข้อมูล" },
    ],
  },
  {
    label: "ตั้งค่า",
    icon: Settings,
    adminOnly: true,
    pages: [
      { href: "/master", label: "Master Data" },
      { href: "/users", label: "กำหนดสิทธิ์ผู้ใช้" },
    ],
  },
];
const APPROVALS_HREF = "/approvals";
const PROCESS_HREF = "/process";

const groupOf = (pathname: string) => GROUPS.find((g) => g.pages.some((p) => pathname.startsWith(p.href)));

/** Label that fades in when the rail (the `group/rail` ancestor) is hovered or focused. */
export const RAIL_LABEL =
  "min-w-0 flex-1 truncate text-sm opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-has-[:focus-visible]/rail:opacity-100";

/**
 * Rail navigation. Collapsed it shows icons only; the rail widens on hover/focus and every item shows its
 * name. `admin` is null for anyone but super_admin (the admin items are hidden); its numbers become badges.
 */
export function SidebarNav({ className, admin = null }: { className?: string; admin?: { approvals: number; reviews: number } | null }) {
  const pathname = usePathname();
  const groups = GROUPS.filter((g) => !g.adminOnly || admin !== null);
  const badges: Record<string, number> = { [APPROVALS_HREF]: admin?.approvals ?? 0, [PROCESS_HREF]: admin?.reviews ?? 0 };
  const waiting: Record<string, string> = { [APPROVALS_HREF]: "รอ", [PROCESS_HREF]: "ต้องตรวจ" };
  return (
    <nav aria-label="เมนูหลัก" className={cn("flex w-full flex-col gap-2", className)}>
      {groups.map(({ label, icon: Icon, pages }) => {
        const href = pages[0].href;
        const active = pages.some((p) => pathname.startsWith(p.href));
        const badge = pages.reduce((n, p) => n + (badges[p.href] ?? 0), 0);
        const detail = pages.filter((p) => badges[p.href]).map((p) => `${waiting[p.href]} ${badges[p.href]} รายการ`).join(", ");
        const fullLabel = badge ? `${label} (${detail})` : label;
        return (
          <Link
            key={href}
            href={href}
            aria-label={fullLabel}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 w-full items-center gap-3 rounded-full pr-4 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-white/70 text-foreground ring-1 ring-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_14px_rgba(0,0,0,0.12)] backdrop-blur-md"
                : "text-foreground/60 hover:bg-white/50 hover:text-foreground",
            )}
          >
            <span className="relative grid size-10 shrink-0 place-items-center">
              <Icon className="size-[18px]" aria-hidden />
              {badge > 0 && (
                <span aria-hidden className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 pt-[2px] font-sans text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-white/80">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
            <span className={RAIL_LABEL}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Tabs for switching between the pages of the group the current page belongs to. Renders nothing for a page
 * that is on its own, so the layout can always include it.
 */
export function SectionTabs() {
  const pathname = usePathname();
  const group = groupOf(pathname);
  if (!group || group.pages.length < 2) return null;
  return (
    <nav aria-label={group.label} className="inline-flex max-w-full gap-1 self-start overflow-x-auto rounded-full bg-black/[0.06] p-1 [scrollbar-width:none]">
      {group.pages.map((p) => {
        const active = pathname.startsWith(p.href);
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-white font-medium shadow-sm shadow-black/10" : "text-foreground/65 hover:bg-white/50",
            )}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
