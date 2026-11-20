import { describe, expect, test } from "vitest";
import { checkPasswordLogin, hashPassword, USERNAME_RE } from "@/lib/auth/password";
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
