import { describe, expect, test } from "vitest";
import { normalizeProvince } from "@/lib/geo/province";
import { PROVINCE_PATHS } from "@/lib/geo/thailand-paths";

describe("normalizeProvince", () => {
  test("aliases and prefixes", () => {
    expect(normalizeProvince("กรุงเทพฯ")).toBe("กรุงเทพมหานคร");
    expect(normalizeProvince(" จ.เชียงใหม่ ")).toBe("เชียงใหม่");
    expect(normalizeProvince("จังหวัดภูเก็ต")).toBe("ภูเก็ต");
    expect(normalizeProvince("นนทบุรี")).toBe("นนทบุรี");
  });

  test("every fixture province name exists on the map", () => {
    const names = new Set(PROVINCE_PATHS.map((p) => p.name));
    for (const p of ["กรุงเทพฯ", "นนทบุรี", "เชียงใหม่", "เชียงราย", "ภูเก็ต"]) expect(names.has(normalizeProvince(p))).toBe(true);
  });
});
