import { describe, expect, test } from "vitest";
import { agingBand, computeTat, holdDays, tatResult } from "@/lib/domain/tat";
import type { StatusLogEntry } from "@/lib/domain/types";

let n = 0;
function entry(req_id: string, from_status: string, to_status: string, effective_date: string): StatusLogEntry {
  n += 1;
  return { id: `LOG-${n}`, req_id, from_status, to_status, effective_date, actor: "ju", at: `2026-01-01T00:00:0${n % 10}Z`, note: "", ref_id: "" };
}

const log = [
  entry("R1", "PendingHold", "Hold", "2026-10-01"),
  entry("R1", "Hold", "Vacancy", "2026-10-11"),
  entry("R1", "PendingHold", "Hold", "2026-11-10"),
  entry("R2", "PendingHold", "Hold", "2026-11-01"),
];

describe("holdDays", () => {
  test("sums closed and open hold spans up to asOf", () => {
    expect(holdDays(log, "R1", "2026-11-17")).toBe(17);
  });
  test("clips spans at asOf", () => {
    expect(holdDays(log, "R1", "2026-10-05")).toBe(4);
  });
  test("zero when never held", () => {
    expect(holdDays(log, "R3", "2026-11-17")).toBe(0);
  });
});

describe("computeTat", () => {
  test("days from request to end minus hold, never negative", () => {
    expect(computeTat({ requestDate: "2026-10-02", endDate: "2026-11-17", holdDays: 0 })).toBe(46);
    expect(computeTat({ requestDate: "2026-10-02", endDate: "2026-11-17", holdDays: 10 })).toBe(36);
    expect(computeTat({ requestDate: "2026-11-20", endDate: "2026-11-17", holdDays: 0 })).toBe(0);
  });
});

describe("tatResult", () => {
  test("offered rows are Meet/NotMeet against SLA", () => {
    expect(tatResult(30, true, 30)).toBe("Meet");
    expect(tatResult(31, true, 30)).toBe("NotMeet");
  });
  test("open rows are InProgress until SLA is exceeded", () => {
    expect(tatResult(30, false, 30)).toBe("InProgress");
    expect(tatResult(31, false, 30)).toBe("NotMeet");
  });
});

describe("agingBand", () => {
  test("band boundaries", () => {
    expect([0, 30, 31, 60, 61, 90, 91].map((d) => agingBand(d, [30, 60, 90]))).toEqual([
      "green", "green", "orange", "orange", "red", "red", "darkred",
    ]);
  });
});
