import { Suspense } from "react";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session-user";
import { Button } from "@/components/ui/button";
import { logout } from "./actions";
import { RefreshButton } from "./refresh-button";

const ROLE_LABEL = { super_admin: "ผู้ดูแลระบบ", ta: "TA", viewer: "ผู้ดูรายงาน" } as const;

async function CurrentUser() {
  const user = await getSessionUser();
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden text-right leading-tight sm:block">
        <span className="block font-medium">{user.name}</span>
        <span className="block text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</span>
      </span>
      <RefreshButton />
      <form action={logout}>
        <Button type="submit" variant="ghost" size="sm">
          ออกจากระบบ
        </Button>
      </form>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <nav className="flex items-center gap-4">
            <Link href="/tracking" className="font-semibold">
              Recruitment
            </Link>
            <Link href="/tracking" className="text-sm text-muted-foreground hover:text-foreground">
              Tracking
            </Link>
          </nav>
          <Suspense fallback={<div className="h-8 w-40" />}>
            <CurrentUser />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
