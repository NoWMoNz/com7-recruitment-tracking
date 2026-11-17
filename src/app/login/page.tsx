import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { devLoginEnabled } from "@/auth.config";
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
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Recruitment Tracking</CardTitle>
          <CardDescription>ระบบติดตามการสรรหาพนักงาน</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Suspense fallback={null}>
            <ErrorMessage searchParams={searchParams} />
          </Suspense>
          <form action={googleLogin}>
            <Button type="submit" className="w-full">
              เข้าสู่ระบบด้วย Google
            </Button>
          </form>
          {devLoginEnabled && (
            <form action={devLogin} className="space-y-2 border-t pt-4">
              <p className="text-xs text-muted-foreground">โหมดทดสอบ (เฉพาะเครื่อง dev)</p>
              <Input name="email" type="email" required placeholder="mind@example.com" aria-label="อีเมลทดสอบ" />
              <Button type="submit" variant="outline" className="w-full">
                เข้าสู่ระบบแบบทดสอบ
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
