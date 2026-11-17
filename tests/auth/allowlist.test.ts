import { expect, test } from "vitest";
import { isAllowed } from "@/lib/auth/allowlist";
import type { User } from "@/lib/domain/types";

const users: User[] = [
  { email: "Ju@Com7.co.th ", name: "จู", role: "super_admin", scope: "", active: true },
  { email: "old@com7.co.th", name: "old", role: "ta", scope: "", active: false },
];

test("allowlisted email matches case- and whitespace-insensitively", () => {
  expect(isAllowed(users, "ju@com7.co.th")).toBe(true);
});

test("inactive user is rejected", () => {
  expect(isAllowed(users, "old@com7.co.th")).toBe(false);
});

test("unknown or missing email is rejected", () => {
  expect(isAllowed(users, "stranger@gmail.com")).toBe(false);
  expect(isAllowed(users, null)).toBe(false);
  expect(isAllowed(users, undefined)).toBe(false);
});
