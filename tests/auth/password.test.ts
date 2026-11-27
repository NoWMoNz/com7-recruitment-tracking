import { describe, expect, test } from "vitest";
import { checkPasswordLogin, hashPassword, planPasswordChange, USERNAME_RE } from "@/lib/auth/password";
import type { Login } from "@/lib/repo/types";

const row = (username: string, password: string, email = "boss@example.com"): Login => ({ username, email, password_hash: hashPassword(password) });

describe("password login", () => {
  const logins = [row(" Boss ", "correct horse")];

  test("the right name and password give the account email; the name ignores case and spaces", async () => {
    expect(await checkPasswordLogin(logins, "boss", "correct horse")).toBe("boss@example.com");
    expect(await checkPasswordLogin(logins, " BOSS ", "correct horse")).toBe("boss@example.com");
  });

  test("a wrong password or an unknown name gives null", async () => {
    expect(await checkPasswordLogin(logins, "boss", "wrong")).toBeNull();
    expect(await checkPasswordLogin(logins, "nobody", "correct horse")).toBeNull();
    expect(await checkPasswordLogin(logins, "boss", "")).toBeNull();
  });

  test("the same password hashes differently each time but both verify", async () => {
    const a = hashPassword("same-password");
    expect(a).not.toBe(hashPassword("same-password"));
    expect(await checkPasswordLogin([{ username: "u", email: "u@example.com", password_hash: a }], "u", "same-password")).toBe("u@example.com");
  });

  test("a damaged or blank hash never matches, and no logins means nobody gets in", async () => {
    expect(await checkPasswordLogin([{ username: "u", email: "u@example.com", password_hash: "scrypt:zz" }], "u", "x")).toBeNull();
    expect(await checkPasswordLogin([{ username: "u", email: "u@example.com", password_hash: "" }], "u", "")).toBeNull();
    expect(await checkPasswordLogin([], "u", "x")).toBeNull();
  });

  test("usernames: lowercase letters, digits and . _ - only, 3 to 40 long", () => {
    for (const ok of ["boss", "a.b-c_9", "abc"]) expect(USERNAME_RE.test(ok), ok).toBe(true);
    for (const bad of ["ab", "Boss", "has space", "a@b", "ชื่อ", "x".repeat(41)]) expect(USERNAME_RE.test(bad), bad).toBe(false);
  });
});

describe("changing one's own password", () => {
  const logins = [
    { rowNumber: 2, row: row("other", "other-password", "other@login.local") },
    { rowNumber: 3, row: row("boss", "old-password", "Boss@Login.local") },
  ];
  const change = (current: string, next: string, confirm = next, email = "boss@login.local") => planPasswordChange(logins, email, { current, next, confirm });

  test("the right current password gives the row to update and a new hash that signs in", async () => {
    const plan = await change("old-password", "new-password-1");
    expect(plan.ok && plan.rowNumber).toBe(3);
    const hash = plan.ok ? plan.password_hash : "";
    expect(await checkPasswordLogin([{ username: "boss", email: "boss@login.local", password_hash: hash }], "boss", "new-password-1")).toBe("boss@login.local");
  });

  test("a wrong current password, a short or repeated new one, or a confirmation that differs are refused", async () => {
    expect(await change("wrong", "new-password-1")).toEqual({ ok: false, errors: { current: "รหัสผ่านปัจจุบันไม่ถูกต้อง" } });
    expect(await change("old-password", "short")).toMatchObject({ ok: false, errors: { next: "รหัสผ่านอย่างน้อย 8 ตัวอักษร" } });
    expect(await change("old-password", "old-password")).toMatchObject({ ok: false, errors: { next: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม" } });
    expect(await change("old-password", "new-password-1", "new-password-2")).toMatchObject({ ok: false, errors: { confirm: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" } });
  });

  test("someone who signs in with Google has no password here to change", async () => {
    expect(await change("x", "new-password-1", "new-password-1", "ju@example.com")).toMatchObject({ ok: false, errors: { form: expect.stringContaining("Google") } });
  });
});
