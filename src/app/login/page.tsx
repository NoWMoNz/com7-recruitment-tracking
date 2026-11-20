import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { devLoginEnabled } from "@/auth.config";
import { Com7Logo } from "@/components/com7-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ERRORS: Record<string, string> = {
  AccessDenied: "บัญชีนี้ยังไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
};

async function login(provider: "google" | "dev", formData?: FormData) {
  "use server";
  try {
    await signIn(provider, {
      ...(formData ? { email: String(formData.get("email") ?? "") } : {}),
      redirectTo: "/tracking",
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
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {ERRORS[error] ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"}
    </p>
  );
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[1500px] gap-4 p-3 lg:grid-cols-[1.25fr_1fr] lg:p-4">
      <section className="relative hidden overflow-hidden rounded-[2rem] lg:block">
        <Image
          src="/welcome-com7.jpg"
          alt="อาคารสำนักงาน Com7"
          fill
          priority
          unoptimized
          sizes="55vw"
          className="object-cover object-[78%_50%]"
        />
      </section>

      <section className="flex flex-col items-center justify-center gap-10 rounded-[2rem] bg-white/65 px-4 py-12 ring-1 ring-white/80 backdrop-blur-md">
        <Com7Logo className="h-16 sm:h-20" />
        <Card className="w-full max-w-sm rounded-[1.75rem] bg-card shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl">Recruitment Tracking</CardTitle>
            <CardDescription>ระบบติดตามการสรรหาพนักงาน</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Suspense fallback={null}>
              <ErrorMessage searchParams={searchParams} />
            </Suspense>
            <form action={googleLogin}>
              <Button type="submit" size="lg" className="h-11 w-full rounded-full text-sm">
                เข้าสู่ระบบด้วย Google
              </Button>
            </form>
            {devLoginEnabled && (
              <form action={devLogin} className="space-y-2 border-t pt-4">
                <p className="text-xs text-muted-foreground">โหมดทดสอบ (เฉพาะเครื่อง dev)</p>
                <Input name="email" type="email" required placeholder="mind@example.com" aria-label="อีเมลทดสอบ" className="h-10 rounded-full px-4" />
                <Button type="submit" variant="outline" className="h-10 w-full rounded-full">
                  เข้าสู่ระบบแบบทดสอบ
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
