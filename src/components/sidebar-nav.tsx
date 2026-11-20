"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Database, FileBarChart, LayoutDashboard, PauseCircle, ShieldCheck, UserCog, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard ภาพรวม", icon: LayoutDashboard },
  { href: "/tracking", label: "ติดตามการสรรหา", icon: ClipboardList },
  { href: "/hold", label: "ตำแหน่งที่พักไว้ (Hold)", icon: PauseCircle },
  { href: "/reports", label: "Reports", icon: FileBarChart },
];
const APPROVALS = { href: "/approvals", label: "อนุมัติ Cancel / Hold", icon: ShieldCheck };
const PROCESS = { href: "/process", label: "ประมวลผลข้อมูล", icon: Workflow };
const MASTER = { href: "/master", label: "Master Data", icon: Database };
const USERS = { href: "/users", label: "กำหนดสิทธิ์ผู้ใช้", icon: UserCog };

/** Label that fades in when the rail (the `group/rail` ancestor) is hovered or focused. */
export const RAIL_LABEL =
  "min-w-0 flex-1 truncate text-sm opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-has-[:focus-visible]/rail:opacity-100";

/**
 * Rail navigation. Collapsed it shows icons only; the rail widens on hover/focus and every item shows its
 * name. `admin` is null for anyone but super_admin (the admin items are hidden); its numbers become badges.
 */
export function SidebarNav({ className, admin = null }: { className?: string; admin?: { approvals: number; reviews: number } | null }) {
  const pathname = usePathname();
  const items = admin === null ? ITEMS : [...ITEMS, APPROVALS, PROCESS, MASTER, USERS];
  const badges: Record<string, number> = { [APPROVALS.href]: admin?.approvals ?? 0, [PROCESS.href]: admin?.reviews ?? 0 };
  const waiting: Record<string, string> = { [APPROVALS.href]: "รอ", [PROCESS.href]: "ต้องตรวจ" };
  return (
    <nav aria-label="เมนูหลัก" className={cn("flex w-full flex-col gap-2", className)}>
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        const badge = badges[href] ?? 0;
        const fullLabel = badge ? `${label} (${waiting[href]} ${badge} รายการ)` : label;
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
