import { findActiveUser } from "@/lib/domain/permissions";
import type { User } from "@/lib/domain/types";

export function isAllowed(users: User[], email: string | null | undefined): boolean {
  if (!email) return false;
  return findActiveUser(users, email) !== null;
}
