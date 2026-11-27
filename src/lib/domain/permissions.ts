import type { Branch, Requisition, User } from "./types";

export function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

export function findActiveUser(users: User[], email: string): User | null {
  const target = normalizeEmail(email);
  return users.find((u) => u.active && normalizeEmail(u.email) === target) ?? null;
}

/** Empty scope = everything. Otherwise comma-separated regions or branch codes. */
export function inScope(user: User, branch: Pick<Branch, "region" | "branch_code">): boolean {
  const tokens = user.scope
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const region = branch.region.trim().toLowerCase();
  const code = branch.branch_code.trim().toLowerCase();
  return tokens.some((t) => t === region || t === code);
}

/** Day-to-day work on a position (Offer, Turndown, Hold / Cancel requests, its TA): an admin on any, a TA on their own. */
export function canEditRequisition(user: User, req: Requisition): boolean {
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (user.role === "ta") return normalizeEmail(req.ta_email) === normalizeEmail(user.email);
  return false;
}
