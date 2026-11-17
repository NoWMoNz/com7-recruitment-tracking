import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { findActiveUser } from "@/lib/domain/permissions";
import type { User } from "@/lib/domain/types";
import { getRepo } from "@/lib/repo";

/**
 * Current user, re-read from the Users tab on every request so role/scope changes
 * and deactivation apply without re-login. Redirects to /login otherwise.
 */
export async function getSessionUser(): Promise<User> {
  const session = await auth();
  const email = session?.user?.email;
  const user = email ? findActiveUser(await getRepo().list("Users"), email) : null;
  if (!user) redirect("/login");
  return user;
}
