import { describe, expect, test } from "vitest";
import { byTa, filtered, groupHires, hiresBetween, indexLog, monthlyRows, monthRange, periodRange, periodText, statusAt, turndownsBetween, weekRange, wholeMonth, type ReportData } from "@/lib/domain/report";
import { parseSettings } from "@/lib/domain/settings";
import type { NewHire, StatusLogEntry, Turndown } from "@/lib/domain/types";
import { branch, offer, positions, req, user } from "./helpers";

const mind = user({ email: "mind@example.com", name: "มายด์" });
const ploy = user({ email: "ploy@example.com", name: "พลอย" });
const ju = user({ email: "ju@example.com", role: "super_admin" });
const entry = (req_id: string, to: string, date: string, from = "Vacancy"): StatusLogEntry => ({
  id: `${req_id}-${to}-${date}`, req_id, from_status: from, to_status: to, effective_date: date, actor: "", at: `${date}T01:00:00Z`, note: "", ref_id: "",
});

describe("ranges", () => {
  test("monthRange handles month lengths and December", () => {
    expect(monthRange("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthRange("2026-12")).toEqual({ first: "2026-12-01", last: "2026-12-31" });
  });
  test("weekRange is Monday to Sunday", () => {
    expect(weekRange("2026-11-18")).toEqual({ first: "2026-11-16", last: "2026-11-22" }); // Wednesday
    expect(weekRange("2026-11-22")).toEqual({ first: "2026-11-16", last: "2026-11-22" }); // Sunday
  });
});

describe("periodRange", () => {
  const usual = monthRange("2026-11");

  test("with nothing picked it falls back to the usual month", () => {
    expect(periodRange({}, usual)).toEqual({ ...usual, all: false });
  });

  test("a range uses what was picked and puts a reversed one right", () => {
    expect(periodRange({ from: "2026-10-01", to: "2026-11-05" }, usual)).toEqual({ first: "2026-10-01", last: "2026-11-05", all: false });
    expect(periodRange({ from: "2026-11-05", to: "2026-10-01" }, usual)).toEqual({ first: "2026-10-01", last: "2026-11-05", all: false });
  });

  test("one end alone means that single day", () => {
    expect(periodRange({ from: "2026-11-10" }, usual)).toEqual({ first: "2026-11-10", last: "2026-11-10", all: false });
    expect(periodRange({ to: "2026-11-10" }, usual)).toEqual({ first: "2026-11-10", last: "2026-11-10", all: false });
  });

  test("all covers every day on record and beats dates", () => {
    const all = periodRange({ all: true, from: "2026-10-01", to: "2026-11-05" }, usual);
    expect(all.all).toBe(true);
    expect(all.first <= "2000-01-01" && all.last >= "2100-01-01").toBe(true);
  });

  test("a whole calendar month is recognised, anything else is not", () => {
    expect(wholeMonth(periodRange({ from: "2026-10-01", to: "2026-10-31" }, usual))).toBe("2026-10");
    expect(wholeMonth(periodRange({ from: "2026-10-01", to: "2026-10-30" }, usual))).toBeNull();
    expect(wholeMonth(periodRange({ from: "2026-10-15", to: "2026-11-14" }, usual))).toBeNull();
    expect(wholeMonth(periodRange({ all: true }, usual))).toBeNull();
  });

  test("heading text", () => {
    expect(periodText(periodRange({ all: true }, usual))).toBe("ทั้งหมด");
    expect(periodText(periodRange({}, usual))).toBe("เดือน 2026-11");
    expect(periodText(periodRange({ from: "2026-10-01", to: "2026-11-05" }, usual))).toBe("01/10/2026 – 05/11/2026");
    expect(periodText(periodRange({ from: "2026-11-05", to: "2026-11-05" }, usual))).toBe("05/11/2026");
  });
});

describe("filtered", () => {
  test("narrows to one business unit; a branch without a BU counts as ไม่ระบุ BU", () => {
    const d: ReportData = {
      requisitions: [req({ id: "A", branch_code: "S7" }), req({ id: "B", branch_code: "BN" }), req({ id: "C", branch_code: "NOBU" })],
      log: [],
      branches: [branch({ branch_code: "S7", bu: "Apple" }), branch({ branch_code: "BN", bu: "BaNANA" }), branch({ branch_code: "NOBU", bu: "" })],
      positions,
      users: [ju],
      settings: parseSettings([]),
    };
    expect(filtered(d, ju, { bu: "BaNANA" }).map((r) => r.id)).toEqual(["B"]);
    expect(filtered(d, ju, { bu: "ไม่ระบุ BU" }).map((r) => r.id)).toEqual(["C"]);
    expect(filtered(d, ju, {}).map((r) => r.id)).toEqual(["A", "B", "C"]);
  });
});

describe("statusAt", () => {
  const r = req({ id: "R1", request_date: "2026-10-01", status: "Hired", closed_at: "2026-11-10" });
  const log = indexLog([entry("R1", "Offer", "2026-10-20"), entry("R1", "Vacancy", "2026-10-25", "Offer"), entry("R1", "Offer", "2026-11-01"), entry("R1", "Hired", "2026-11-10", "Offer")]);
  test("replays the log up to the date", () => {
    expect(statusAt(r, log, "2026-09-30")).toBeNull();
    expect(statusAt(r, log, "2026-10-10")).toBe("Vacancy");
    expect(statusAt(r, log, "2026-10-22")).toBe("Offer");
    expect(statusAt(r, log, "2026-10-26")).toBe("Vacancy");
    expect(statusAt(r, log, "2026-11-10")).toBe("Hired");
  });
  test("rows without history use their current status from the day it was set", () => {
    const old = req({ id: "R2", request_date: "2026-08-01", status: "Cancel", closed_at: "2026-11-01" });
    expect(statusAt(old, indexLog([]), "2026-10-31")).toBe("Vacancy");
    expect(statusAt(old, indexLog([]), "2026-11-01")).toBe("Cancel");
  });
});

describe("monthlyRows", () => {
  const data = (log: StatusLogEntry[]): ReportData & { offers: never[] } => ({
    requisitions: [], log, branches: [branch({ branch_code: "BKK-012" }), branch({ branch_code: "CNX-001", region: "ภาคเหนือ" })], positions, users: [mind, ploy], settings: parseSettings([]), offers: [],
  });

  test("carried in / new / closed / cancel / hold / offer pending / remaining for November", () => {
    const reqs = [
      req({ id: "A", request_date: "2026-09-01" }), // carried in, still open
      req({ id: "B", request_date: "2026-11-05" }), // new, still open
      req({ id: "C", request_date: "2026-10-01", status: "Hired", closed_at: "2026-11-10" }), // carried in, hired
      req({ id: "D", request_date: "2026-10-01", status: "Cancel", closed_at: "2026-11-03" }), // carried in, cancelled
      req({ id: "E", request_date: "2026-10-01", status: "Hold" }), // carried in, held
      req({ id: "F", request_date: "2026-11-02", status: "Offer", offer_id: "O" }), // new, offer pending
      req({ id: "G", request_date: "2026-07-01", status: "Hired", closed_at: "2026-09-01" }), // closed before: not counted
      req({ id: "H", request_date: "2026-12-01" }), // future: not counted
      req({ id: "P", request_date: "2026-10-01", ta_email: "ploy@example.com", branch_code: "CNX-001" }),
    ];
    const log = [entry("C", "Offer", "2026-10-20"), entry("C", "Hired", "2026-11-10", "Offer"), entry("D", "Cancel", "2026-11-03"), entry("E", "Hold", "2026-11-08"), entry("F", "Offer", "2026-11-12")];
    const rows = monthlyRows(data(log), reqs, "2026-11", "2026-11-18");
    expect(rows.map((r) => [r.taName, r.region])).toEqual([
      ["พลอย", "ภาคเหนือ"],
      ["มายด์", "ภาคกลาง"],
    ]);
    expect(rows[1]).toMatchObject({ carriedIn: 4, new: 2, total: 6, closed: 1, cancel: 1, hold: 1, offerPending: 1, remaining: 3 });
    expect(byTa(rows)).toHaveLength(2);
  });

  test("any from–to range gives the same cut as the month when it spans the month, and its own cut otherwise", () => {
    const reqs = [
      req({ id: "A", request_date: "2026-09-01" }),
      req({ id: "B", request_date: "2026-11-05" }),
      req({ id: "C", request_date: "2026-10-01", status: "Hired", closed_at: "2026-11-10" }),
    ];
    const log = [entry("C", "Hired", "2026-11-10", "Offer")];
    const d = data(log);
    expect(monthlyRows(d, reqs, { first: "2026-11-01", last: "2026-11-30" }, "2026-11-18")).toEqual(monthlyRows(d, reqs, "2026-11", "2026-11-18"));
    // 1–7 Nov: B (5 Nov) is new, C is not closed yet (10 Nov), A and C were open before the range.
    const [row] = monthlyRows(d, reqs, { first: "2026-11-01", last: "2026-11-07" }, "2026-11-18");
    expect(row).toMatchObject({ carriedIn: 2, new: 1, closed: 0, remaining: 3 });
    // A range that ends after today is counted up to today.
    const [live] = monthlyRows(d, reqs, { first: "2026-11-01", last: "2026-12-31" }, "2026-11-18");
    expect(live).toMatchObject({ closed: 1, remaining: 2 });
  });

  test("TAT Meet counts offers made in the month against the position SLA", () => {
    const reqs = [req({ id: "A", request_date: "2026-10-01" }), req({ id: "B", request_date: "2026-11-01" })];
    const offers = [offer({ id: "O1", req_id: "A", offer_date: "2026-11-10" }), offer({ id: "O2", req_id: "B", offer_date: "2026-11-10" }), offer({ id: "O3", req_id: "B", offer_date: "2026-10-31" })];
    const [row] = monthlyRows({ ...data([]), offers }, reqs, "2026-11", "2026-11-18");
    expect(row).toMatchObject({ tatTotal: 2, tatMeet: 1 }); // A: 40 days > 30; B: 9 days
  });
});

describe("weekly hires and turndowns", () => {
  const base: ReportData = { requisitions: [], log: [], branches: [branch({ branch_code: "BKK-012", branch_name: "ลาดพร้าว" })], positions, users: [mind, ju], settings: parseSettings([]) };
  const reqs = [req({ id: "R1", status: "Hired" }), req({ id: "R2", status: "Hired" }), req({ id: "R3" })];
  const hire = (p: Partial<NewHire> & Pick<NewHire, "id" | "req_id">): NewHire => ({
    ...offer(p), employee_id: "E", start_date: null, hired_at: "2026-11-18", tat: 20, tat_result: "Meet", ...p,
  });

  test("hires in the week, grouped with average TAT and Meet %", () => {
    const newHires = [
      hire({ id: "H1", req_id: "R1", tat: 20, tat_result: "Meet", sourcing_channel: "JobThai" }),
      hire({ id: "H2", req_id: "R2", tat: 40, tat_result: "NotMeet", sourcing_channel: "JobThai" }),
      hire({ id: "H3", req_id: "R1", hired_at: "2026-11-01" }),
    ];
    const rows = hiresBetween({ ...base, newHires }, reqs, "2026-11-16", "2026-11-22");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ branchName: "ลาดพร้าว", positionName: "Sales", taName: "มายด์" });
    expect(groupHires(rows, "channel")).toEqual([{ key: "JobThai", hired: 2, avgTat: 30, meetPct: 50 }]);
  });

  test("turndowns in range, newest first, with days after offer", () => {
    const td = (date: string): Turndown => ({ ...offer({ id: `T${date}`, req_id: "R3", offer_date: "2026-11-10" }), turndown_date: date, reason: "ได้งานอื่น", recorded_by: "" });
    const rows = turndownsBetween({ ...base, turndowns: [td("2026-11-12"), td("2026-11-15"), td("2026-10-01")] }, reqs, "2026-11-01", "2026-11-30");
    expect(rows.map((r) => [r.date, r.daysAfterOffer])).toEqual([
      ["2026-11-15", 5],
      ["2026-11-12", 2],
    ]);
  });
});
