import { describe, expect, test } from "vitest";
import { buildTrend, groupOpen, longestOpen, momentum, nearSla, offersWaiting, provinceStats, summarize, sumTrend } from "@/lib/domain/dashboard";
import { parseSettings } from "@/lib/domain/settings";
import { branch, positions, req, user } from "./helpers";
import type { TrackingRow } from "@/lib/domain/tracking";

function row(p: Partial<TrackingRow> & Pick<TrackingRow, "id">): TrackingRow {
  return {
    region: "ภาคกลาง", province: "", bu: "Apple", am: "", rm: "", branchCode: "B1", branchName: "B1", positionName: "Sales", requestDate: "2026-10-02",
    status: "Vacancy", upcoming: false, tat: 10, tatResult: "InProgress", agingBand: "green", taEmail: "mind@example.com", ta: "mind@example.com",
    taName: "มายด์", offerName: null, offerDate: null, offerChannel: null, offer: null, startOverdue: false, holdDays: 0, slaDays: 30, canEdit: false, version: 1, ...p,
  };
}

describe("summarize", () => {
  const rows = [
    row({ id: "V1", tat: 46, tatResult: "NotMeet", agingBand: "orange" }),
    row({ id: "V2", tat: 5 }),
    row({ id: "O1", status: "Offer", tat: 12, tatResult: "Meet", agingBand: null }),
    row({ id: "O2", status: "Offer", tat: 40, tatResult: "NotMeet", agingBand: null, region: "ภาคเหนือ", taEmail: "b@x.com", ta: "b@x.com", taName: "บี" }),
    row({ id: "U1", upcoming: true, tat: 0 }),
  ];

  test("open vacancy excludes upcoming rows", () => {
    expect(summarize(rows).open).toBe(2); // the two Offers are not still being recruited for
  });

  test("offer count and TAT meet share over judged rows", () => {
    const s = summarize(rows);
    expect(s.offers).toBe(2);
    // Meet 1 of (Meet 1 + NotMeet 2)
    expect(s.tatMeetPct).toBe(33);
  });

  test("tatMeetPct is null when nothing has been judged", () => {
    expect(summarize([row({ id: "V" })]).tatMeetPct).toBeNull();
  });

  test("aging bands and average only cover still-vacant, already-open rows", () => {
    const s = summarize(rows);
    expect(s.bands).toEqual({ green: 1, orange: 1, red: 0, darkred: 0 });
    expect(s.avgAging).toBe(26); // (46 + 5) / 2 = 25.5
  });

  test("regions sorted by open count then name; TAs sorted by open count", () => {
    const s = summarize(rows);
    expect(s.regions.map((r) => [r.name, r.open])).toEqual([
      ["ภาคกลาง", 2],
      ["ภาคเหนือ", 0],
    ]);
    expect(s.tas.map((t) => [t.name, t.open, t.offers, t.notMeet])).toEqual([
      ["มายด์", 2, 1, 1],
      ["บี", 0, 1, 1],
    ]);
  });

  test("empty input", () => {
    expect(summarize([])).toMatchObject({ open: 0, offers: 0, tatMeetPct: null, avgAging: null, regions: [], tas: [] });
  });
});

describe("attention lists", () => {
  const rows = [
    row({ id: "A", tat: 95, agingBand: "darkred", tatResult: "NotMeet" }),
    row({ id: "B", tat: 28, slaDays: 30 }),
    row({ id: "C", tat: 24, slaDays: 30 }),
    row({ id: "D", tat: 31, slaDays: 30, tatResult: "NotMeet", agingBand: "orange" }),
    row({ id: "E", tat: 60, status: "Offer", agingBand: null, offerDate: "2026-11-01", offerName: "นายเอ บี" }),
    row({ id: "F", tat: 70, status: "Offer", agingBand: null, offerDate: "2026-11-15", offerName: "นายซี ดี" }),
    row({ id: "U", tat: 99, upcoming: true }),
  ];

  test("longestOpen: still-vacant, already-open rows by TAT desc, limited", () => {
    expect(longestOpen(rows, 3).map((r) => r.id)).toEqual(["A", "D", "B"]);
  });

  test("nearSla: not yet over SLA and past the share of it, soonest first", () => {
    expect(nearSla(rows, 0.9).map((r) => r.id)).toEqual(["B"]);
    expect(nearSla(rows, 0.7).map((r) => r.id)).toEqual(["B", "C"]);
    expect(nearSla(rows, 1)).toEqual([]);
  });

  test("offersWaiting: oldest offer first, with days since the offer", () => {
    expect(offersWaiting(rows, "2026-11-18").map((o) => [o.row.id, o.days])).toEqual([["E", 17], ["F", 3]]);
  });

  test("groupOpen: counts per key, sorted by open then name, with average aging", () => {
    const g = groupOpen(rows, "positionName", 5);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ name: "Sales", open: 4, offers: 2, notMeet: 2, avgAging: 45, bands: { green: 2, orange: 1, red: 0, darkred: 1 } });
    expect(g[0].oldest?.id).toBe("A");
  });
});

describe("tat split and province stats", () => {
  const rows = [
    row({ id: "M", status: "Offer", tatResult: "Meet", agingBand: null }),
    row({ id: "N", tatResult: "NotMeet", tat: 40, agingBand: "orange", province: "จ.เชียงใหม่" }),
    row({ id: "P", province: "เชียงใหม่", tat: 5 }),
    row({ id: "Q", province: "ขอนแก่น", tat: 9 }),
  ];

  test("summary counts Meet, NotMeet and in-progress separately", () => {
    expect(summarize(rows).tat).toEqual({ meet: 1, notMeet: 1, inProgress: 2 });
  });

  test("provinceStats merges spellings and names the oldest vacancy", () => {
    const m = provinceStats(rows);
    expect(m.get("เชียงใหม่")).toMatchObject({ open: 2, notMeet: 1, avgAging: 23 });
    expect(m.get("เชียงใหม่")?.oldest?.id).toBe("N");
    expect(m.get("ขอนแก่น")?.open).toBe(1);
    expect(m.has("")).toBe(false);
  });
});

describe("trend", () => {
  const months = [
    { month: "2026-10", rows: [{ region: "ภาคกลาง", bu: "Apple", am: "ก", rm: "R", ta: "mind@example.com", new: 4, offers: 3, closed: 2, cancel: 1, hold: 0, open: 10, tatDays: 90, slaDays: 90 }, { region: "ภาคเหนือ", bu: "BaNANA", am: "ข", rm: "R", ta: "ploy@example.com", new: 1, offers: 1, closed: 1, cancel: 0, hold: 1, open: 4, tatDays: 40, slaDays: 30 }] },
    { month: "2026-11", rows: [{ region: "ภาคกลาง", bu: "Apple", am: "ก", rm: "R", ta: "mind@example.com", new: 2, offers: 5, closed: 1, cancel: 0, hold: 0, open: 9, tatDays: 100, slaDays: 150 }] },
  ];

  test("sums every region by default", () => {
    expect(sumTrend(months, {})).toEqual([
      { month: "2026-10", new: 5, offers: 4, closed: 3, cancel: 1, hold: 1, open: 14, tatDays: 130, slaDays: 120 },
      { month: "2026-11", new: 2, offers: 5, closed: 1, cancel: 0, hold: 0, open: 9, tatDays: 100, slaDays: 150 },
    ]);
  });

  test("filters to one region", () => {
    expect(sumTrend(months, { region: "ภาคเหนือ" }).map((m) => m.offers)).toEqual([1, 0]);
  });

  test("filters to one business unit, alone or with a region", () => {
    expect(sumTrend(months, { bu: "BaNANA" }).map((m) => m.new)).toEqual([1, 0]);
    expect(sumTrend(months, { bu: "Apple" }).map((m) => m.new)).toEqual([4, 2]);
    expect(sumTrend(months, { region: "ภาคเหนือ", bu: "Apple" }).map((m) => m.new)).toEqual([0, 0]);
  });

  test("filters to one AM, or one TA in any case", () => {
    expect(sumTrend(months, { am: "ข" }).map((m) => m.new)).toEqual([1, 0]);
    expect(sumTrend(months, { ta: "MIND@example.com" }).map((m) => m.new)).toEqual([4, 2]);
    expect(sumTrend(months, { rm: "R" }).map((m) => m.new)).toEqual([5, 2]);
  });

  test("buildTrend keeps each AM's positions on rows of their own", () => {
    const d = {
      requisitions: [req({ id: "1", branch_code: "B1", request_date: "2026-11-05" }), req({ id: "2", branch_code: "B2", request_date: "2026-11-06", ta_email: "ploy@example.com" })],
      log: [],
      branches: [branch({ branch_code: "B1", am: "ก", rm: "R" }), branch({ branch_code: "B2", am: "ข", rm: "R" })],
      positions,
      users: [user({ email: "mind@example.com" }), user({ email: "ploy@example.com" })],
      settings: parseSettings([]),
      offers: [],
    };
    const trend = buildTrend(d, d.requisitions, "2026-11-20", 1);
    expect(sumTrend(trend, { am: "ก" }).map((m) => m.new)).toEqual([1]);
    expect(sumTrend(trend, { ta: "ploy@example.com" }).map((m) => m.new)).toEqual([1]);
    expect(sumTrend(trend, {}).map((m) => m.new)).toEqual([2]);
  });

  test("momentum compares this month with last: fewer open, faster offers", () => {
    expect(momentum(sumTrend(months, {}))).toEqual({ openDelta: -5, offers: 5, avgTat: 20, avgSla: 30, tatDelta: -13 });
  });

  test("momentum leaves out what it cannot compare", () => {
    // Last month had offers but this one has none: no average, no change.
    expect(momentum(sumTrend(months, { region: "ภาคเหนือ" }))).toMatchObject({ openDelta: -4, offers: 0, avgTat: null, tatDelta: null });
    // Only one month: nothing to compare with.
    expect(momentum(sumTrend(months, {}).slice(-1))).toMatchObject({ openDelta: null, tatDelta: null, avgTat: 20 });
    // Nothing was open last month: no baseline, so no change is shown.
    const fresh = [{ month: "2026-10", rows: [] }, { month: "2026-11", rows: [{ region: "ภาคกลาง", bu: "Apple", am: "", rm: "", ta: "", new: 996, offers: 0, closed: 0, cancel: 0, hold: 0, open: 996, tatDays: 0, slaDays: 0 }] }];
    expect(momentum(sumTrend(fresh, {})).openDelta).toBeNull();
    expect(momentum([])).toEqual({ openDelta: null, offers: 0, avgTat: null, avgSla: null, tatDelta: null });
  });
});
