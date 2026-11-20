import { describe, expect, it } from "vitest";
import { countAxis, monotonePath, monotoneY } from "@/lib/chart/curve";

describe("monotonePath", () => {
  it("is empty for no points and a single move for one", () => {
    expect(monotonePath([])).toBe("");
    expect(monotonePath([{ x: 1, y: 2 }])).toBe("M1,2");
  });

  it("passes through every point", () => {
    const d = monotonePath([
      { x: 0, y: 10 },
      { x: 10, y: 4 },
      { x: 20, y: 8 },
    ]);
    expect(d.startsWith("M0,10")).toBe(true);
    expect(d).toContain(" 10,4C");
    expect(d.endsWith(" 20,8")).toBe(true);
  });

  it("does not overshoot between equal neighbours", () => {
    // Control points of a flat run must stay on the same y.
    const d = monotonePath([
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ]);
    expect(d).toMatch(/^M0,5C3.33,5 6.67,5 10,5C/);
  });
});

describe("countAxis", () => {
  it("shows every whole number for small counts", () => {
    expect(countAxis(0)).toEqual({ top: 1, ticks: [0, 1] });
    expect(countAxis(3)).toEqual({ top: 3, ticks: [0, 1, 2, 3] });
  });

  it("rounds larger counts up to an even step", () => {
    expect(countAxis(7)).toEqual({ top: 8, ticks: [0, 2, 4, 6, 8] });
    expect(countAxis(23)).toEqual({ top: 30, ticks: [0, 10, 20, 30] });
    expect(countAxis(20)).toEqual({ top: 20, ticks: [0, 5, 10, 15, 20] });
    expect(countAxis(100).top).toBe(100);
  });
});

describe("monotoneY", () => {
  const pts = [
    { x: 0, y: 10 },
    { x: 10, y: 4 },
    { x: 20, y: 8 },
  ];

  it("hits every point and holds the ends outside the range", () => {
    expect(monotoneY(pts, 0)).toBeCloseTo(10);
    expect(monotoneY(pts, 10)).toBeCloseTo(4);
    expect(monotoneY(pts, 20)).toBeCloseTo(8);
    expect(monotoneY(pts, -5)).toBe(10);
    expect(monotoneY(pts, 99)).toBe(8);
  });

  it("stays between two neighbouring values, never overshooting", () => {
    for (let x = 0; x <= 10; x += 0.5) {
      const y = monotoneY(pts, x);
      expect(y).toBeGreaterThanOrEqual(4 - 1e-9);
      expect(y).toBeLessThanOrEqual(10 + 1e-9);
    }
  });

  it("stays flat along a flat run", () => {
    const flat = [
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ];
    expect(monotoneY(flat, 4)).toBeCloseTo(5);
  });
});
