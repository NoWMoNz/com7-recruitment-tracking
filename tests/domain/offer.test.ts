import { describe, expect, test } from "vitest";
import { backdateError, planOffer, planTurndown, type OfferInput } from "@/lib/domain/offer";
import { parseSettings } from "@/lib/domain/settings";
import type { StatusLogEntry } from "@/lib/domain/types";
import { noLog, offer, req, user } from "./helpers";

const today = "2026-11-17";
const settings = parseSettings([]);
const mind = user({ email: "mind@example.com", name: "มายด์" });
const other = user({ email: "other@example.com" });
const ju = user({ email: "ju@example.com", role: "super_admin" });
const now = new Date("2026-11-17T05:00:00.000Z");
const channels = ["JobThai", "Referral"];

const input = (p: Partial<OfferInput> = {}): OfferInput => ({
  title: "นาย",
  firstName: " สมชาย ",
  lastName: "ใจดี",
  phone: "",
  offerDate: "2026-11-16",
  channel: "JobThai",
  ...p,
});

type OfferArgs = Parameters<typeof planOffer>[0];
const offerArgs = (over: Partial<OfferArgs> = {}): OfferArgs => ({
  req: req({ id: "R1", request_date: "2026-10-02" }),
  input: input(),
  viewer: mind,
  today,
  settings,
  channels,
  log: noLog,
  ids: { offerId: "OFF-1", logId: "LOG-1" },
  now,
  ...over,
});

describe("backdateError", () => {
  test("today and up to N days back are fine", () => {
    expect(backdateError("2026-11-17", today, 3, "ta")).toBeNull();
    expect(backdateError("2026-11-14", today, 3, "ta")).toBeNull();
  });
  test("older than N days is rejected for TA but allowed for super_admin", () => {
    expect(backdateError("2026-11-13", today, 3, "ta")).toMatch(/3 วัน/);
    expect(backdateError("2026-11-13", today, 3, "super_admin")).toBeNull();
  });
  test("future dates are rejected for everyone", () => {
    expect(backdateError("2026-11-18", today, 3, "super_admin")).toMatch(/ล่วงหน้า/);
  });
});

describe("planOffer", () => {
  test("builds the offer, the requisition patch and the log entry", () => {
    const r = planOffer(offerArgs());
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value.offer).toMatchObject({
      id: "OFF-1",
      req_id: "R1",
      title: "นาย",
      first_name: "สมชาย",
      last_name: "ใจดี",
      offer_date: "2026-11-16",
      sourcing_channel: "JobThai",
      tat_at_offer: 45,
      ta_email: "mind@example.com",
      created_by: "mind@example.com",
      created_at: now.toISOString(),
    });
    expect(r.value.reqPatch).toEqual({ status: "Offer", status_date: "2026-11-16", offer_id: "OFF-1" });
    expect(r.value.logEntry).toMatchObject({ id: "LOG-1", req_id: "R1", from_status: "Vacancy", to_status: "Offer", effective_date: "2026-11-16", ref_id: "OFF-1" });
  });

  test("accepts dd/mm/yyyy", () => {
    const r = planOffer(offerArgs({ input: input({ offerDate: "15/11/2026" }) }));
    expect(r.ok && r.value.offer.offer_date).toBe("2026-11-15");
  });

  test("TAT at offer excludes days spent on hold", () => {
    const log: StatusLogEntry[] = [
      { id: "L1", req_id: "R1", from_status: "PendingHold", to_status: "Hold", effective_date: "2026-10-10", actor: "", at: "a", note: "", ref_id: "" },
      { id: "L2", req_id: "R1", from_status: "Hold", to_status: "Vacancy", effective_date: "2026-10-20", actor: "", at: "b", note: "", ref_id: "" },
    ];
    const r = planOffer(offerArgs({ log }));
    expect(r.ok && r.value.offer.tat_at_offer).toBe(35);
  });

  test("field errors are reported together", () => {
    const r = planOffer(offerArgs({ input: input({ title: "ดร.", firstName: " ", lastName: "", channel: "Other", offerDate: "2026-11-01", phone: "abc" }) }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["channel", "firstName", "lastName", "offerDate", "phone", "title"]);
  });

  test("only the owning TA or super_admin, and only while Vacancy", () => {
    expect(planOffer(offerArgs({ viewer: other })).ok).toBe(false);
    expect(planOffer(offerArgs({ viewer: ju, input: input({ offerDate: "2026-10-01" }) })).ok).toBe(true);
    const r = planOffer(offerArgs({ req: req({ id: "R1", status: "Offer" }) }));
    expect(!r.ok && r.errors.form).toMatch(/ว่าง/);
  });
});

describe("planTurndown", () => {
  const offered = req({ id: "R1", status: "Offer", offer_id: "OFF-1", request_date: "2026-10-02" });
  const theOffer = offer({ id: "OFF-1", req_id: "R1", offer_date: "2026-11-15" });
  type TdArgs = Parameters<typeof planTurndown>[0];
  const args = (over: Partial<TdArgs> = {}): TdArgs => ({
    req: offered,
    offer: theOffer,
    input: { date: "2026-11-17", reason: " ไม่มารายงานตัว " },
    viewer: mind,
    today,
    settings,
    ids: { logId: "LOG-2" },
    now,
    ...over,
  });

  test("moves the person to Turndowns and puts the requisition back to Vacancy with its original request date", () => {
    const r = planTurndown(args());
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value.turndown).toMatchObject({ ...theOffer, turndown_date: "2026-11-17", reason: "ไม่มารายงานตัว", recorded_by: "mind@example.com" });
    expect(r.value.reqPatch).toEqual({ status: "Vacancy", status_date: "2026-11-17", offer_id: "" });
    expect(r.value.logEntry).toMatchObject({ from_status: "Offer", to_status: "Vacancy", ref_id: "OFF-1", note: "Turndown: ไม่มารายงานตัว" });
  });

  test("needs a reason and a date not before the offer", () => {
    const r = planTurndown(args({ input: { date: "2026-11-14", reason: "" } }));
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["date", "reason"]);
  });

  test("needs an Offer requisition whose offer matches, owned by the viewer", () => {
    expect(planTurndown(args({ req: { ...offered, status: "Vacancy" } })).ok).toBe(false);
    expect(planTurndown(args({ offer: { ...theOffer, id: "OFF-9" } })).ok).toBe(false);
    expect(planTurndown(args({ viewer: other })).ok).toBe(false);
  });
});
