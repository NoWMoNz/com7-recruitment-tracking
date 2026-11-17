import { describe, expect, test } from "vitest";
import { parseSettings, slaFor } from "@/lib/domain/settings";
import type { Position } from "@/lib/domain/types";

const pos: Position = { position_code: "SALES", position_name: "Sales", position_group: "Store", sla_days: null };
const defaults = parseSettings([]);

describe("parseSettings", () => {
  test("defaults when empty", () => {
    expect(defaults).toEqual({ defaultSlaDays: 30, agingBands: [30, 60, 90], backdateDays: 3 });
  });
  test("reads values and falls back on invalid ones", () => {
    expect(
      parseSettings([
        { key: "default_sla_days", value: "45" },
        { key: "aging_bands", value: "30,60,90" },
        { key: "backdate_days", value: "x" },
      ]),
    ).toEqual({ defaultSlaDays: 45, agingBands: [30, 60, 90], backdateDays: 3 });
  });
});

describe("slaFor", () => {
  test("position override, else default", () => {
    expect(slaFor({ ...pos, sla_days: 14 }, defaults)).toBe(14);
    expect(slaFor({ ...pos, sla_days: null }, defaults)).toBe(30);
    expect(slaFor(undefined, defaults)).toBe(30);
  });
});
