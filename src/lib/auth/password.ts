import { randomBytes, scrypt as scryptCb, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Login } from "@/lib/repo/types";

const scrypt = promisify(scryptCb);
const KEYLEN = 32;

export const MIN_PASSWORD = 8;
/** Letters, digits, dot, dash and underscore only, so a name is easy to type and safe to show. */
export const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;

/** Names are matched without regard to case or surrounding spaces. */
export const normalizeUsername = (s: string) => s.trim().toLowerCase();

/** `scrypt:salt:hash` for a password. Colons, not `$`, so nothing tries to expand it. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, KEYLEN).toString("hex")}`;
}

async function matches(password: string, hash: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = hash.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEYLEN) return false;
  const actual = (await scrypt(password, Buffer.from(saltHex, "hex"), KEYLEN)) as Buffer;
  return timingSafeEqual(actual, expected);
}

// A hash to burn the same time on when the name is unknown, so timing does not reveal which names exist.
const DECOY = hashPassword("decoy");

export type PasswordChange = { ok: true; rowNumber: number; password_hash: string } | { ok: false; errors: Record<string, string> };

/**
 * Someone changing their own password: the Logins row of their account (by email) when the current password
 * is right and the new one is long enough, not the old one, and typed the same twice.
 */
export async function planPasswordChange(
  logins: { rowNumber: number; row: Login }[],
  email: string,
  input: { current: string; next: string; confirm: string },
): Promise<PasswordChange> {
  const mine = logins.filter((l) => l.row.email.trim().toLowerCase() === email.trim().toLowerCase());
  if (!mine.length) return { ok: false, errors: { form: "บัญชีนี้เข้าระบบด้วย Google จึงไม่มีรหัสผ่านในระบบให้เปลี่ยน" } };
  const errors: Record<string, string> = {};
  if (input.next.length < MIN_PASSWORD) errors.next = `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
  else if (input.next === input.current) errors.next = "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม";
  if (input.confirm !== input.next) errors.confirm = "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน";
  let hit: { rowNumber: number } | undefined;
  for (const l of mine) if (await matches(input.current, l.row.password_hash)) hit = l;
  if (!hit) return { ok: false, errors: { current: "รหัสผ่านปัจจุบันไม่ถูกต้อง" } };
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, rowNumber: hit.rowNumber, password_hash: hashPassword(input.next) };
}

/** The Users-tab email to sign in as, or null when the name or password is wrong. */
export async function checkPasswordLogin(logins: Login[], username: string, password: string): Promise<string | null> {
  const found = logins.find((l) => normalizeUsername(l.username) === normalizeUsername(username));
  const ok = await matches(password, found?.password_hash ?? DECOY);
  return found && ok ? found.email.trim() : null;
}
