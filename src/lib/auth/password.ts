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

/** The Users-tab email to sign in as, or null when the name or password is wrong. */
export async function checkPasswordLogin(logins: Login[], username: string, password: string): Promise<string | null> {
  const found = logins.find((l) => normalizeUsername(l.username) === normalizeUsername(username));
  const ok = await matches(password, found?.password_hash ?? DECOY);
  return found && ok ? found.email.trim() : null;
}
