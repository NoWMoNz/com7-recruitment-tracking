import { describe, expect, test } from "vitest";
import { holdStart, planDecision, planRequest, planResume } from "@/lib/domain/approval";
import { parseSettings } from "@/lib/domain/settings";
import { holdDays } from "@/lib/domain/tat";
import type { Approval, StatusLogEntry } from "@/lib/domain/types";
import { req, user } from "./helpers";

const today = "2026-11-17";
const settings = parseSettings([]);
const mind = user({ email: "mind@example.com" });
const other = user({ email: "other@example.com" });
const ju = user({ email: "ju@example.com", role: "super_admin" });
const now = new Date("2026-11-17T05:00:00.000Z");

type ReqArgs = Parameters<typeof planRequest>[0];
const requestArgs = (over: Partial<ReqArgs> = {}): ReqArgs => ({
  req: req({ id: "R1" }),
  type: "Hold",
  input: { date: "2026-11-16", reason: " ร้านปรับปรุง " },
  evidenceRef: "local:abc",
  viewer: mind,
  today,
  settings,
  ids: { approvalId: "APR-1", logId: "LOG-1" },
  now,
  ...over,
});

const pendingHold: Approval = {
  id: "APR-1", req_id: "R1", type: "Hold", reason: "ร้านปรับปรุง", effective_date: "2026-11-16", evidence_url: "local:abc",
  requested_by: "mind@example.com", requested_at: "x", status: "Pending", decided_by: "", decided_at: "", decision_note: "",
};

describe("planRequest", () => {
  test("Vacancy -> PendingHold with a pending approval and a log entry", () => {
    const r = planRequest(requestArgs());
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value.approval).toMatchObject({ id: "APR-1", req_id: "R1", type: "Hold", reason: "ร้านปรับปรุง", effective_date: "2026-11-16", status: "Pending", evidence_url: "local:abc" });
    expect(r.value.reqPatch).toEqual({ status: "PendingHold", status_date: "2026-11-16" });
    expect(r.value.logEntry).toMatchObject({ from_status: "Vacancy", to_status: "PendingHold", ref_id: "APR-1" });
  });

  test("Cancel maps to PendingCancel", () => {
    const r = planRequest(requestArgs({ type: "Cancel" }));
    expect(r.ok && r.value.reqPatch.status).toBe("PendingCancel");
  });

  test("evidence, reason and an allowed date are all required", () => {
    const r = planRequest(requestArgs({ evidenceRef: null, input: { date: "2026-11-01", reason: "" } }));
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["date", "evidence", "reason"]);
  });

  test("only Vacancy rows, only the owner or super_admin", () => {
    const offer = planRequest(requestArgs({ req: req({ id: "R1", status: "Offer" }) }));
    expect(!offer.ok && offer.errors.form).toMatch(/Turndown/);
    expect(planRequest(requestArgs({ viewer: other })).ok).toBe(false);
    expect(planRequest(requestArgs({ viewer: ju })).ok).toBe(true);
  });
});

describe("planDecision", () => {
  type DecArgs = Parameters<typeof planDecision>[0];
  const decArgs = (over: Partial<DecArgs> = {}): DecArgs => ({
    req: req({ id: "R1", status: "PendingHold" }), approval: pendingHold, decision: "approve", note: "", viewer: ju, today, ids: { logId: "LOG-2" }, now, ...over,
  });

  test("approve Hold: requisition becomes Hold from the requested date", () => {
    const r = planDecision(decArgs());
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value.approvalPatch).toMatchObject({ status: "Approved", decided_by: "ju@example.com" });
    expect(r.value.reqPatch).toEqual({ status: "Hold", status_date: "2026-11-16" });
    expect(r.value.logEntry).toMatchObject({ from_status: "PendingHold", to_status: "Hold", effective_date: "2026-11-16" });
  });

  test("approve Cancel closes the requisition", () => {
    const r = planDecision(decArgs({ req: req({ id: "R1", status: "PendingCancel" }), approval: { ...pendingHold, type: "Cancel" } }));
    expect(r.ok && r.value.reqPatch).toEqual({ status: "Cancel", status_date: "2026-11-16", closed_at: "2026-11-16" });
  });

  test("reject needs a note and returns the requisition to Vacancy", () => {
    expect(planDecision(decArgs({ decision: "reject" })).ok).toBe(false);
    const r = planDecision(decArgs({ decision: "reject", note: " รูปไม่ชัด " }));
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value.approvalPatch).toMatchObject({ status: "Rejected", decision_note: "รูปไม่ชัด" });
    expect(r.value.reqPatch).toEqual({ status: "Vacancy", status_date: today });
    expect(r.value.logEntry.note).toBe("ไม่อนุมัติ: รูปไม่ชัด");
  });

  test("only super_admin, only pending approvals that match the requisition", () => {
    expect(planDecision(decArgs({ viewer: mind })).ok).toBe(false);
    expect(planDecision(decArgs({ approval: { ...pendingHold, status: "Approved" } })).ok).toBe(false);
    expect(planDecision(decArgs({ req: req({ id: "R1", status: "Vacancy" }) })).ok).toBe(false);
  });
});

describe("planResume", () => {
  const entry = (to: string, date: string, from = "PendingHold"): StatusLogEntry => ({
    id: `L-${date}`, req_id: "R1", from_status: from, to_status: to, effective_date: date, actor: "", at: date, note: "", ref_id: "",
  });
  const log = [entry("Hold", "2026-11-01")];
  type ResArgs = Parameters<typeof planResume>[0];
  const resArgs = (over: Partial<ResArgs> = {}): ResArgs => ({
    req: req({ id: "R1", status: "Hold" }), input: { date: "2026-11-17" }, log, viewer: mind, today, settings, ids: { logId: "LOG-3" }, now, ...over,
  });

  test("Hold -> Vacancy, and the hold period is then excluded from TAT", () => {
    const r = planResume(resArgs());
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value.reqPatch).toEqual({ status: "Vacancy", status_date: "2026-11-17" });
    expect(holdDays([...log, r.value.logEntry], "R1", "2026-11-20")).toBe(16);
  });

  test("holdStart picks the latest move into Hold", () => {
    expect(holdStart([entry("Hold", "2026-09-01"), entry("Vacancy", "2026-09-10", "Hold"), ...log], "R1")).toBe("2026-11-01");
  });

  test("date rules: backdate limit, not before the hold started; status and owner checks", () => {
    expect(planResume(resArgs({ input: { date: "2026-11-10" } })).ok).toBe(false);
    expect(planResume(resArgs({ viewer: ju, input: { date: "2026-10-30" } })).ok).toBe(false);
    expect(planResume(resArgs({ viewer: ju, input: { date: "2026-11-05" } })).ok).toBe(true);
    expect(planResume(resArgs({ req: req({ id: "R1", status: "Vacancy" }) })).ok).toBe(false);
    expect(planResume(resArgs({ viewer: other })).ok).toBe(false);
  });
});
