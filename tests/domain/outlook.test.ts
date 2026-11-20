import { describe, expect, test } from "vitest";
import { buildManpowerRows } from "@/lib/domain/manpower";
import { buildResignRows } from "@/lib/domain/resign";
import { manpowerGaps, offerOutcomes, summarizeDeclines, summarizeResignations, upcomingResignations } from "@/lib/domain/outlook";
import type { ImportResign, QuotaLine, Turndown } from "@/lib/domain/types";
import { branch, offer, positions, req, user } from "./helpers";

const TODAY = "2026-11-20";
const ju = user({ email: "ju@example.com", role: "super_admin" });
const north = user({ email: "north@example.com", role: "viewer", scope: "ภาคเหนือ" });
const branches = [
  branch({ branch_code: "A", branch_name: "สาขา A", bu: "Apple", region: "ภาคกลาง" }),
  branch({ branch_code: "B", branch_name: "สาขา B", bu: "BaNANA", region: "ภาคเหนือ" }),
];

describe("upcomingResignations / summarizeResignations", () => {
  const resign = (employee_id: string, effective_date: string, p: Partial<ImportResign> = {}): ImportResign => ({
    employee_id, title: "นาย", first_name: "ก", last_name: "ข", branch_code: "A", position_code: "SALES",
    effective_date, processed_at: "2026-11-17T10:00:00Z", cancelled_at: "", cancelled_by: "", cancel_note: "", ...p,
  });
  const rows = buildResignRows(
    {
      resign: [
        resign("E1", "2026-11-25"),
        resign("E2", "2026-12-20"), // exactly 30 days ahead
        resign("E3", "2026-12-21"), // 31 days ahead
        resign("E4", "2026-11-10"), // already gone
        resign("E5", "2026-11-28", { cancelled_at: "2026-11-18T00:00:00Z" }), // withdrawn
      ].map((row, i) => ({ rowNumber: i + 2, row })),
      requisitions: [],
      branches,
      positions,
      users: [ju],
    },
    ju,
    TODAY,
  );

  test("keeps only resignations still to take effect, soonest first", () => {
    expect(upcomingResignations(rows).map((r) => r.effectiveDate)).toEqual(["2026-11-25", "2026-12-20", "2026-12-21"]);
  });

  test("splits them at 30 days ahead, the edge day included", () => {
    const { soon, later } = summarizeResignations(upcomingResignations(rows), TODAY);
    expect(soon).toHaveLength(2);
    expect(later).toBe(1);
  });
});

describe("manpowerGaps", () => {
  const line = (branch_code: string, position_code: string, quota: number, actual: number): QuotaLine => ({ branch_code, position_code, quota, actual, report_date: "2026-11-11" });
  const gaps = (quota: QuotaLine[], requisitions = [req({ id: "1", branch_code: "A", position_code: "SALES" })]) =>
    manpowerGaps(buildManpowerRows({ quota, requisitions, branches, positions }, ju, TODAY).rows);

  test("counts per position what HR is short of and no open requisition covers", () => {
    // SALES short 3 with 1 open -> 2 uncovered; SM short 1 with none open -> 1 uncovered.
    const [a] = gaps([line("A", "SALES", 4, 1), line("A", "SM", 1, 0)]);
    expect(a).toMatchObject({ branchName: "สาขา A", short: 4, gap: 3 });
  });

  test("a position opened more than it is short never cancels another position's gap", () => {
    const reqs = [req({ id: "1", branch_code: "A", position_code: "SALES" }), req({ id: "2", branch_code: "A", position_code: "SALES" })];
    const [a] = gaps([line("A", "SALES", 1, 0), line("A", "SM", 1, 0)], reqs);
    expect(a.gap).toBe(1); // only SM is uncovered
  });

  test("leaves out branches that are fully covered, full or over, and orders by gap", () => {
    const result = gaps([line("A", "SALES", 1, 0), line("B", "SALES", 3, 0)]);
    expect(result.map((g) => g.branchName)).toEqual(["สาขา B"]); // A is short 1 with 1 open
  });
});

describe("offerOutcomes / summarizeDeclines", () => {
  const reqs = [req({ id: "R1", branch_code: "A" }), req({ id: "R2", branch_code: "B" })];
  const turn = (id: string, req_id: string, offer_date: string, reason: string): Turndown => ({ ...offer({ id, req_id, offer_date }), turndown_date: offer_date, reason, recorded_by: "" });
  const data = {
    offers: [offer({ id: "O1", req_id: "R1", offer_date: "2026-11-10" })],
    newHires: [offer({ id: "O2", req_id: "R1", offer_date: "2026-10-01" })],
    turndowns: [
      turn("T1", "R1", "2026-11-01", "เงินเดือนต่ำ"),
      turn("T2", "R2", "2026-10-20", "เงินเดือนต่ำ"),
      turn("T3", "R2", "2026-10-25", "  "),
      turn("T4", "R1", "2026-08-01", "นานแล้ว"), // outside 90 days
    ],
    requisitions: reqs,
    branches,
  };

  test("counts Offers of the last 90 days, open, hired and declined alike", () => {
    const s = summarizeDeclines(offerOutcomes(data, ju, TODAY));
    expect(s).toMatchObject({ total: 5, declined: 3, pct: 60 });
  });

  test("ranks reasons, and a blank reason is named as such", () => {
    const { reasons } = summarizeDeclines(offerOutcomes(data, ju, TODAY));
    expect(reasons).toEqual([
      { reason: "เงินเดือนต่ำ", count: 2 },
      { reason: "ไม่ระบุเหตุผล", count: 1 },
    ]);
  });

  test("leaves out branches outside the viewer's scope; no Offers gives no percentage", () => {
    expect(summarizeDeclines(offerOutcomes(data, north, TODAY))).toMatchObject({ total: 2, declined: 2 });
    expect(summarizeDeclines([])).toMatchObject({ total: 0, pct: null });
  });
});
