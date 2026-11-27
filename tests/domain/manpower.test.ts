import { describe, expect, test } from "vitest";
import { buildManpowerRows, filterManpowerRows, summarizeManpower } from "@/lib/domain/manpower";
import type { QuotaLine, Requisition } from "@/lib/domain/types";
import { branch, positions, req, user } from "./helpers";

const TODAY = "2026-11-20";
const ju = user({ email: "ju@example.com", role: "super_admin" });
const north = user({ email: "north@example.com", role: "viewer", scope: "ภาคเหนือ" });

const line = (branch_code: string, position_code: string, quota: number, actual: number): QuotaLine => ({ branch_code, position_code, quota, actual, report_date: "2026-11-11" });

const branches = [
  branch({ branch_code: "A", branch_name: "สาขา A", bu: "Apple", region: "ภาคกลาง", am: "ก", rm: "R" }),
  branch({ branch_code: "B", branch_name: "สาขา B", bu: "BaNANA", region: "ภาคเหนือ" }),
  branch({ branch_code: "C", branch_name: "สาขา C", bu: "Apple", region: "ภาคกลาง" }),
  branch({ branch_code: "Z", branch_name: "สาขาปิด", region: "ภาคกลาง", status: "Closed", close_date: "2026-10-01" }),
];
const ploy = user({ email: "ploy@example.com" });
const assignments = [{ branch_code: "A", position_group: "", ta_email: "ploy@example.com" }];
const allPositions = [
  ...positions,
  { position_code: "PIA BTB", position_name: "PIA BTB Dedicate", position_group: "", sla_days: null },
  { position_code: "PIA BTB (1 ปี)", position_name: "PIA BTB Dedicate (1 ปี)", position_group: "", sla_days: null },
  { position_code: "PIA-4", position_name: "Bilateral Student (ทวิภาคี)", position_group: "", sla_days: null },
];
const data = (quota: QuotaLine[], requisitions: Requisition[] = []) => ({ quota, requisitions, branches, positions: allPositions, assignments, users: [ju, ploy] });
const sales = (id: string, p: Partial<Requisition> = {}) => req({ id, branch_code: "A", position_code: "SALES", ...p });

describe("buildManpowerRows", () => {
  test("per position short and over; a branch sums them so a surplus never hides a shortage", () => {
    const { rows } = buildManpowerRows(data([line("A", "SALES", 3, 1), line("A", "SM", 1, 1), line("A", "ASM", 0, 2)]), ju, TODAY);
    expect(rows).toHaveLength(1);
    const a = rows[0];
    expect(a).toMatchObject({ branchCode: "A", branchName: "ID A_สาขา A", bu: "Apple", quota: 4, actual: 4, short: 2, over: 2, status: "short" });
    const byCode = Object.fromEntries(a.positions.map((p) => [p.positionCode, p]));
    expect(byCode.SALES).toMatchObject({ positionName: "Sales", quota: 3, actual: 1, short: 2, over: 0 });
    expect(byCode.ASM).toMatchObject({ quota: 0, actual: 2, short: 0, over: 2 }); // over with no quota at all
    expect(byCode.SM).toMatchObject({ short: 0, over: 0 });
  });

  test("status: short, over or full; an empty store is short by its whole quota", () => {
    const { rows } = buildManpowerRows(data([line("A", "SALES", 4, 0), line("B", "SALES", 2, 3), line("C", "SALES", 2, 2)]), ju, TODAY);
    const st = Object.fromEntries(rows.map((r) => [r.branchCode, [r.status, r.short, r.over]]));
    expect(st).toEqual({ A: ["short", 4, 0], B: ["over", 0, 1], C: ["full", 0, 0] });
  });

  test("rows are ordered by shortage (most first), then branch name", () => {
    const { rows } = buildManpowerRows(data([line("C", "SALES", 2, 2), line("B", "SALES", 5, 1), line("A", "SALES", 5, 1)]), ju, TODAY);
    expect(rows.map((r) => r.branchCode)).toEqual(["A", "B", "C"]);
  });

  test("an Offer fills the seat: it adds to Actual, takes away from the shortage, and is not counted as open", () => {
    const reqs = [sales("1"), sales("2", { status: "Offer" }), sales("3", { status: "Offer" })];
    const { rows } = buildManpowerRows(data([line("A", "SALES", 4, 1)], reqs), ju, TODAY);
    const p = rows[0].positions[0];
    expect(p).toMatchObject({ quota: 4, hrActual: 1, offers: 2, actual: 3, short: 1, over: 0, open: 1, status: "short", match: "match" });
    expect(rows[0]).toMatchObject({ hrActual: 1, offers: 2, actual: 3, short: 1, open: 1 });
  });

  test("with enough Offers the position is full, and one more makes it over", () => {
    const offers = (n: number) => Array.from({ length: n }, (_, i) => sales(`o${i}`, { status: "Offer" }));
    expect(buildManpowerRows(data([line("A", "SALES", 3, 1)], offers(2)), ju, TODAY).rows[0]).toMatchObject({ status: "full", short: 0, over: 0, actual: 3 });
    expect(buildManpowerRows(data([line("A", "SALES", 3, 1)], offers(3)), ju, TODAY).rows[0]).toMatchObject({ status: "over", short: 0, over: 1, actual: 4 });
  });

  test("open in system counts only on-process requisitions of that branch and position whose date has arrived", () => {
    const reqs = [
      sales("1"),
      sales("2", { status: "Offer" }),
      sales("3", { status: "Hold" }), // not open
      sales("4", { status: "Hired" }), // closed
      sales("5", { request_date: "2026-12-01" }), // not effective yet
      sales("6", { position_code: "SM" }), // another position
      sales("7", { branch_code: "B" }), // another branch
    ];
    const { rows } = buildManpowerRows(data([line("A", "SALES", 4, 1), line("A", "SM", 1, 0)], reqs), ju, TODAY);
    const a = rows[0];
    expect(a.positions.find((p) => p.positionCode === "SALES")).toMatchObject({ open: 1, offers: 1 }); // the Offer is not "open"
    expect(a.positions.find((p) => p.positionCode === "SM")).toMatchObject({ open: 1, offers: 0 });
    expect(a.open).toBe(2);
  });

  test("match compares open in system with the shortage: equal, fewer or more", () => {
    const m = (short: number, open: number) => {
      const reqs = Array.from({ length: open }, (_, i) => sales(`r${i}`));
      return buildManpowerRows(data([line("A", "SALES", short, 0)], reqs), ju, TODAY).rows[0].positions[0].match;
    };
    expect(m(2, 2)).toBe("match");
    expect(m(3, 1)).toBe("fewer");
    expect(m(1, 3)).toBe("more");
    expect(m(0, 0)).toBe("match");
  });

  test("a branch that is closed, unknown, or outside the viewer's scope is not listed; closed ones are counted", () => {
    const quota = [line("A", "SALES", 2, 0), line("B", "SALES", 2, 0), line("Z", "SALES", 3, 0), line("NOPE", "SALES", 1, 0)];
    const all = buildManpowerRows(data(quota), ju, TODAY);
    expect(all.rows.map((r) => r.branchCode)).toEqual(["A", "B"]);
    expect(all.closedBranches).toBe(1);
    expect(buildManpowerRows(data(quota), north, TODAY).rows.map((r) => r.branchCode)).toEqual(["B"]);
  });

});

describe("positions left out of the counts", () => {
  const quota = [line("A", "SALES", 3, 1), line("A", "PIA BTB", 4, 1), line("A", "PIA BTB (1 ปี)", 1, 3), line("A", "PIA-4", 0, 2)];

  test("are listed with their own Quota / Actual, last, but never short or over", () => {
    const [a] = buildManpowerRows(data(quota), ju, TODAY).rows;
    expect(a.positions.map((p) => [p.positionCode, p.counted, p.quota, p.actual, p.short, p.over])).toEqual([
      ["SALES", true, 3, 1, 2, 0],
      ["PIA-4", false, 0, 2, 0, 0],
      ["PIA BTB", false, 4, 1, 0, 0],
      ["PIA BTB (1 ปี)", false, 1, 3, 0, 0],
    ]);
  });

  test("leave the branch totals, its status and the summary", () => {
    const reqs = [sales("1"), req({ id: "2", branch_code: "A", position_code: "PIA BTB" }), req({ id: "3", branch_code: "A", position_code: "PIA-4", status: "Offer" })];
    const { rows } = buildManpowerRows(data(quota, reqs), ju, TODAY);
    expect(rows[0]).toMatchObject({ quota: 3, hrActual: 1, offers: 0, actual: 1, short: 2, over: 0, open: 1, status: "short", match: "fewer" });
    expect(rows[0].positions.find((p) => p.positionCode === "PIA-4")).toMatchObject({ offers: 1, actual: 3 }); // still shown
    expect(summarizeManpower(rows)).toMatchObject({ quota: 3, actual: 1, short: 2, over: 0 });
  });

  test("a branch with only uncounted positions is full with nothing to count", () => {
    const [a] = buildManpowerRows(data([line("A", "PIA-4", 0, 5)]), ju, TODAY).rows;
    expect(a).toMatchObject({ quota: 0, actual: 0, short: 0, over: 0, status: "full" });
    expect(a.positions).toHaveLength(1);
  });
});

describe("AM / RM / TA on manpower rows", () => {
  const { rows } = buildManpowerRows(data([line("A", "SALES", 2, 1), line("C", "SALES", 2, 1)]), ju, TODAY);
  test("a branch row carries its AM, RM and TA", () => {
    expect(rows.find((r) => r.branchCode === "A")).toMatchObject({ am: "ก", rm: "R", taEmail: "ploy@example.com", taName: "ploy" });
    expect(rows.find((r) => r.branchCode === "C")).toMatchObject({ am: "", rm: "", taEmail: "", taName: "" });
  });
  test("filters by AM and by TA in any case", () => {
    expect(filterManpowerRows(rows, { am: "ก" }).map((r) => r.branchCode)).toEqual(["A"]);
    expect(filterManpowerRows(rows, { ta: "PLOY@example.com" }).map((r) => r.branchCode)).toEqual(["A"]);
  });
});

describe("filterManpowerRows and summarizeManpower", () => {
  const { rows } = buildManpowerRows(data([line("A", "SALES", 4, 1), line("B", "SALES", 2, 3), line("C", "SALES", 2, 2)]), ju, TODAY);
  const ids = (f: Parameters<typeof filterManpowerRows>[1]) => filterManpowerRows(rows, f).map((r) => r.branchCode).sort();

  test("by bu, region, status and search", () => {
    expect(ids({ bu: "Apple" })).toEqual(["A", "C"]);
    expect(ids({ region: "ภาคเหนือ" })).toEqual(["B"]);
    expect(ids({ status: "full" })).toEqual(["C"]);
    expect(ids({ q: "สาขา b" })).toEqual(["B"]);
    expect(ids({ q: "a" })).toEqual(["A"]); // matches branch name or code, case-insensitive
  });

  test("totals add up over the rows given", () => {
    expect(summarizeManpower(rows)).toEqual({ branches: 3, quota: 8, actual: 6, short: 3, over: 1, full: 1 });
    expect(summarizeManpower(filterManpowerRows(rows, { bu: "Apple" }))).toEqual({ branches: 2, quota: 6, actual: 3, short: 3, over: 0, full: 1 });
    expect(summarizeManpower([])).toEqual({ branches: 0, quota: 0, actual: 0, short: 0, over: 0, full: 0 });
  });
});
