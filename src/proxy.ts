import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

/** Unauthenticated requests go to /login (via the `authorized` callback). */
export default auth;

export const config = {
  // api/cron authenticates itself with CRON_SECRET (Vercel Cron has no session).
  matcher: ["/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
