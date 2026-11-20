import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { devLoginEnabled } from "@/auth.config";
import { Com7Logo } from "@/components/com7-logo";
import { PRESS, SubmitButton } from "@/components/pending";
import { Input } from "@/components/ui/input";

const ERRORS: Record<string, string> = {
  AccessDenied: "บัญชีนี้ยังไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
};

async function login(provider: "google" | "dev", formData?: FormData) {
  "use server";
  try {
    await signIn(provider, {
      ...(formData ? { email: String(formData.get("email") ?? "") } : {}),
      redirectTo: "/dashboard",
    });
  } catch (e) {
    if (e instanceof AuthError) redirect(`/login?error=${e.type}`);
    throw e;
  }
}

async function googleLogin() {
  "use server";
  await login("google");
}

async function devLogin(formData: FormData) {
  "use server";
  await login("dev", formData);
}

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
      {ERRORS[error] ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"}
    </p>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.92l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77Z" />
    </svg>
  );
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="liquid-glass relative w-full max-w-md rounded-[2.5rem] px-8 py-10 sm:px-10">
        <Com7Logo className="mx-auto h-14" />
        <div className="mt-8 text-center">
          <h1 className="font-heading text-3xl font-light">Recruitment Tracking</h1>
          <p className="mt-2 text-sm text-foreground/70">ระบบติดตามการสรรหาพนักงาน</p>
        </div>

        <div className="mt-8 space-y-4">
          <Suspense fallback={null}>
            <ErrorMessage searchParams={searchParams} />
          </Suspense>
          <form action={googleLogin}>
            <SubmitButton
              pendingLabel="กำลังเข้าสู่ระบบ…"
              className={`group flex h-12 w-full items-center justify-center gap-3 rounded-full bg-ink-chip text-sm font-medium text-white outline-none hover:bg-ink-chip/90 hover:shadow-[0_14px_28px_-10px_rgba(20,30,30,0.55)] focus-visible:ring-3 focus-visible:ring-ring/50 ${PRESS}`}
            >
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-white transition-transform duration-200 ease-out group-hover:scale-110 motion-reduce:transition-none">
                <GoogleMark />
              </span>
              เข้าสู่ระบบด้วย Google
            </SubmitButton>
          </form>
          <p className="text-center text-xs text-foreground/65">ใช้บัญชี Google ที่ผู้ดูแลระบบเพิ่มสิทธิ์ไว้แล้วเท่านั้น</p>

          {devLoginEnabled && (
            <form action={devLogin} className="liquid-glass-tile space-y-2 rounded-3xl p-4">
              <p className="text-xs text-foreground/65">โหมดทดสอบ (เฉพาะเครื่อง dev)</p>
              <Input name="email" type="email" required placeholder="mind@example.com" aria-label="อีเมลทดสอบ" className="h-11 rounded-full bg-white px-4 transition-shadow duration-200 focus-visible:shadow-[0_0_0_4px_rgba(31,157,85,0.12)]" />
              <SubmitButton
                pendingLabel="กำลังเข้าสู่ระบบ…"
                className="group flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-medium ring-1 ring-black/[0.1] outline-none transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.04] hover:shadow-[0_10px_24px_-10px_rgba(0,0,0,0.3)] focus-visible:scale-[1.04] focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98] active:duration-100 motion-reduce:transition-none motion-reduce:hover:scale-100"
              >
                <LogIn className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                เข้าสู่ระบบแบบทดสอบ
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
