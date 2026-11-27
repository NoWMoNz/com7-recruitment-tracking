import { Suspense } from "react";
import Link from "next/link";
import { Com7Logo } from "@/components/com7-logo";
import { LogoutIcon, PRESS } from "@/components/pending";
import { RAIL_LABEL, SectionTabs, SidebarNav } from "@/components/sidebar-nav";
import { getSessionUser } from "@/lib/auth/session-user";
import { getRepo } from "@/lib/repo";
import { normalizeEmail } from "@/lib/domain/permissions";
import type { User } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { logout } from "./actions";
import { ChangePasswordButton } from "./change-password";
import { RefreshButton } from "./refresh-button";

const ROLE_LABEL = { super_admin: "ผู้ดูแลระบบ", admin: "แอดมิน", ta: "TA", viewer: "ผู้ดูรายงาน" } as const;

function LogoutButton({ className, rail = false }: { className?: string; rail?: boolean }) {
  return (
    <form action={logout} className={rail ? "w-full" : undefined}>
      <button
        type="submit"
        aria-label="ออกจากระบบ"
        title="ออกจากระบบ"
        className={cn(
          "group/logout rounded-full bg-white/80 text-foreground ring-1 ring-black/[0.05] outline-none hover:bg-white hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.25)] focus-visible:ring-3 focus-visible:ring-ring/50",
          PRESS,
          rail ? "relative flex h-10 w-full items-center gap-3 overflow-hidden pr-4" : "grid size-10 place-items-center",
          className,
        )}
      >
        {rail ? (
          <>
            <span className="grid size-10 shrink-0 place-items-center">
              <LogoutIcon />
            </span>
            {/* Centred across the whole button (not in what is left of it after the icon); inset-x-10 keeps it clear of the icon. */}
            <span className={cn(RAIL_LABEL, "absolute inset-x-10 top-0 flex-none text-center leading-10")}>ออกจากระบบ</span>
          </>
        ) : (
          <LogoutIcon />
        )}
      </button>
    </form>
  );
}

/** Rail menu by role; super_admin's Approvals and Processing are badged with what is waiting for them. */
async function RailNav() {
  const user = await getSessionUser();
  if (user.role !== "super_admin") return <SidebarNav role={user.role} />;
  const [approvals, reviews] = await Promise.all([getRepo().list("Approvals"), getRepo().list("ReviewQueue")]);
  const badges = { approvals: approvals.filter((a) => a.status === "Pending").length, reviews: reviews.filter((r) => !r.resolved_at).length };
  return <SidebarNav role={user.role} badges={badges} />;
}

/** Tabs between the pages of the current section that the user may open. */
async function RoleSectionTabs() {
  const user = await getSessionUser();
  return <SectionTabs role={user.role} />;
}

/** Whether the user can sign in with a name and password (and so has one to change). */
async function hasPasswordLogin(user: User): Promise<boolean> {
  const logins = await getRepo().list("Logins").catch(() => []);
  return logins.some((l) => normalizeEmail(l.email) === normalizeEmail(user.email));
}

/** Bottom of the rail: who is signed in, change password (name + password sign-ins), and sign out. */
async function RailUser() {
  const user = await getSessionUser();
  const withPassword = await hasPasswordLogin(user);
  return (
    <>
      <div title={`${user.name} · ${ROLE_LABEL[user.role]}`} className="flex h-11 w-full items-center gap-3 overflow-hidden">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink-chip font-heading text-sm text-white">{user.name.slice(0, 1)}</span>
        <span className={cn(RAIL_LABEL, "leading-tight")}>
          <span className="block truncate font-medium">{user.name}</span>
          <span className="block truncate text-xs text-foreground/60">{ROLE_LABEL[user.role]}</span>
        </span>
      </div>
      {withPassword && <ChangePasswordButton rail />}
      <LogoutButton rail />
    </>
  );
}

async function TopUser() {
  const user = await getSessionUser();
  const withPassword = await hasPasswordLogin(user);
  return (
    <div className="flex items-center gap-2">
      <RefreshButton />
      <span className="hidden items-center gap-2 rounded-full bg-white/80 py-1 pr-4 pl-1 ring-1 ring-black/[0.05] sm:flex">
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-ink-chip font-heading text-xs text-white">
          {user.name.slice(0, 1)}
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-medium">{user.name}</span>
          <span className="block text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</span>
        </span>
      </span>
      {withPassword && <ChangePasswordButton className="lg:hidden" />}
      <LogoutButton className="lg:hidden" />
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1600px] gap-4 p-3 lg:py-5 lg:pr-5 lg:pl-[6.25rem]">
      <aside
        aria-label="แถบเมนู"
        className="group/rail fixed inset-y-0 left-0 z-30 hidden w-[4.5rem] flex-col overflow-hidden bg-gradient-to-b from-neutral-300/60 via-neutral-200/50 to-neutral-300/60 px-4 py-5 backdrop-blur-2xl backdrop-saturate-200 shadow-[inset_-1px_0_0_rgba(255,255,255,0.8),4px_0_30px_rgba(0,0,0,0.06)] transition-[width,box-shadow] duration-200 ease-out hover:w-64 hover:shadow-[inset_-1px_0_0_rgba(255,255,255,0.8),12px_0_40px_rgba(0,0,0,0.12)] has-[:focus-visible]:w-64 lg:flex"
      >
        {/* Nav starts level with the first row under the page title (the Dashboard filters): py-5 + h-9 title + gap-4. */}
        <div className="absolute inset-x-4 top-[4.5rem]">
          <Suspense fallback={<SidebarNav />}>
            <RailNav />
          </Suspense>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <Suspense fallback={<div className="size-11 rounded-full bg-white/70" />}>
            <RailUser />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Desktop uses the icon rail only; this bar is kept for phones, which have no rail. */}
        <header className="flex items-center justify-between gap-3 lg:hidden">
          <Link
            href="/tracking"
            className="flex items-center gap-3 rounded-full bg-white/80 py-2 pr-5 pl-4 ring-1 ring-black/[0.05] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Com7Logo className="h-5" />
            <span aria-hidden className="h-4 w-px bg-border" />
            <span className="text-sm text-muted-foreground">Recruitment Tracking</span>
          </Link>
          <Suspense fallback={<div className="h-10 w-24" />}>
            <TopUser />
          </Suspense>
        </header>
        <Suspense fallback={null}>
          <RoleSectionTabs />
        </Suspense>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
