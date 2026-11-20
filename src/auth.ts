import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { isAllowed } from "@/lib/auth/allowlist";
import { checkPasswordLogin } from "@/lib/auth/password";
import { getRepo } from "@/lib/repo";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    // Names and passwords live in the Logins tab. Signing in acts as that row's Users-tab email, so the allowlist still applies.
    Credentials({
      id: "password",
      name: "Password",
      credentials: { username: {}, password: {} },
      authorize: async (c) => {
        const email = await checkPasswordLogin(await getRepo().list("Logins"), String(c?.username ?? ""), String(c?.password ?? ""));
        return email ? { id: email, email, name: email } : null;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    signIn: async ({ user }) => isAllowed(await getRepo().list("Users"), user.email),
  },
});
