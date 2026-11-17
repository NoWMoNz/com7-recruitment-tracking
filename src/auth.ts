import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { isAllowed } from "@/lib/auth/allowlist";
import { getRepo } from "@/lib/repo";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    signIn: async ({ user }) => isAllowed(await getRepo().list("Users"), user.email),
  },
});
