import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

/** Dev-only email login. Never available in production builds. */
export const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "1" && process.env.NODE_ENV !== "production";

/** Edge-safe config shared by the proxy and the full auth setup (no data access here). */
export const authConfig = {
  providers: [
    Google,
    ...(devLoginEnabled
      ? [
          Credentials({
            id: "dev",
            name: "Dev login",
            credentials: { email: { label: "Email", type: "email" } },
            authorize: async (c) => {
              const email = String(c?.email ?? "").trim();
              return email ? { id: email, email, name: email } : null;
            },
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    authorized: ({ auth }) => Boolean(auth?.user),
  },
} satisfies NextAuthConfig;
