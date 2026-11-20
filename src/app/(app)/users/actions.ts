"use server";

import { getSessionUser } from "@/lib/auth/session-user";
import { hashPassword, MIN_PASSWORD, normalizeUsername, USERNAME_RE } from "@/lib/auth/password";
import { ROLES } from "@/lib/domain/master";
import { normalizeEmail } from "@/lib/domain/permissions";
import type { Role } from "@/lib/domain/types";
import { getRepo } from "@/lib/repo";
import { ConflictError, MissingColumnError, MissingTabError, NotFoundError } from "@/lib/repo";
import { fail, GONE, writeError, type ActionResult } from "../action-utils";

const ADMIN_ONLY = "เฉพาะผู้ดูแลระบบเท่านั้น";
const COLUMNS = ["username", "email", "password_hash"];

/** Admin-only page, so an unexpected failure shows its cause (a Sheet permission, a missing tab) instead of "try again". */
function adminError(e: unknown): ActionResult {
  if (e instanceof ConflictError || e instanceof NotFoundError || e instanceof MissingColumnError || e instanceof MissingTabError) return writeError(e);
  console.error("[action] write failed", e);
  return fail(`บันทึกไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
}

async function admin() {
  const viewer = await getSessionUser();
  return viewer.role === "super_admin" ? viewer : null;
}

/** Where a login with no Google account of its own lives in the Users tab; the address is never mailed to. */
const loginEmail = (username: string) => `${username}@login.local`;

/**
 * Add a name + password sign-in. It needs no existing user: a Users row is made for it (so the role and scope
 * rules, the allowlist and "turn off" all work the same), and it can be edited in the table above.
 * An existing name only gets a new password; its user is left as it is.
 */
export async function saveLogin(input: { username: string; password: string; role: string }): Promise<ActionResult> {
  if (!(await admin())) return fail(ADMIN_ONLY);
  const username = normalizeUsername(String(input.username ?? ""));
  const password = String(input.password ?? "");
  const role = String(input.role ?? "") as Role;

  const errors: Record<string, string> = {};
  if (!USERNAME_RE.test(username)) errors.username = "ใช้ a-z 0-9 . _ - ความยาว 3-40 ตัวอักษร";
  if (password.length < MIN_PASSWORD) errors.password = `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
  if (!ROLES.includes(role)) errors.role = "เลือกสิทธิ์";
  if (Object.keys(errors).length) return { ok: false, errors };

  const repo = getRepo();
  try {
    await repo.requireColumns("Logins", COLUMNS);
    const rows = await repo.listNumbered("Logins");
    const current = rows.find((r) => normalizeUsername(r.row.username) === username);
    const password_hash = hashPassword(password);
    if (current) {
      await repo.updateAt("Logins", [{ rowNumber: current.rowNumber, patch: { password_hash } }]);
    } else {
      const email = loginEmail(username);
      if (!(await repo.list("Users")).some((u) => normalizeEmail(u.email) === email)) {
        await repo.append("Users", [{ email, name: username, role, scope: "", active: true }]);
      }
      await repo.append("Logins", [{ username, email, password_hash }]);
    }
    await Promise.all([repo.invalidate("Logins"), repo.invalidate("Users")]);
  } catch (e) {
    return adminError(e);
  }
  return { ok: true };
}

export async function removeLogin(username: string): Promise<ActionResult> {
  if (!(await admin())) return fail(ADMIN_ONLY);
  const repo = getRepo();
  try {
    const rows = await repo.listNumbered("Logins");
    const hit = rows.find((r) => normalizeUsername(r.row.username) === normalizeUsername(username));
    if (!hit) return fail(GONE);
    await repo.removeAt("Logins", [hit.rowNumber]);
    await repo.invalidate("Logins");
  } catch (e) {
    return adminError(e);
  }
  return { ok: true };
}
