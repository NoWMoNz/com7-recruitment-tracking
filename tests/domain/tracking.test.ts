import { describe, expect, test } from "vitest";
import { buildTrackingRows, filterTrackingRows, type TrackingData } from "@/lib/domain/tracking";
import { parseSettings } from "@/lib/domain/settings";
import { branch, noLog, offer, positions, req, user } from "./helpers";

const today = "2026-11-17";
const mind = user({ email: "mind@example.com", name: "มายด์" });
const boss = user({ email: "boss@example.com", role: "viewer" });
const ju = user({ email: "ju@example.com", role: "super_admin" });

function data(over: Partial<TrackingData> = {}): TrackingData {
  return {
    requisitions: [
      req({ id: "V1", request_date: "2026-10-02" }),
      req({ id: "O1", status: "Offer", offer_id: "OF1", request_date: "2026-10-02" }),
      req({ id: "U1", request_date: "2026-11-20" }),
      req({ id: "PC", status: "PendingCancel" }),
      req({ id: "PH", status: "PendingHold" }),
      req({ id: "H1", status: "Hold" }),
      req({ id: "C1", status: "Cancel" }),
      req({ id: "HI", status: "Hired" }),
      req({ id: "T1", status: "Transfer" }),
      req({ id: "N1", branch_code: "CNX-001", ta_email: "other@example.com", position_code: "SM" }),
    ],
    offers: [offer({ id: "OF1", req_id: "O1", offer_date: "2026-10-20" })],
    log: noLog,
    branches: [
      branch({ branch_code: "BKK-012", branch_name: "เซ็นทรัลลาดพร้าว", region: "ภาคกลาง" }),
      branch({ branch_code: "CNX-001", branch_name: "เซ็นทรัลเฟสติวัล", region: "ภาคเหนือ", province: "เชียงใหม่" }),
    ],
    positions,
    users: [mind, boss, ju],
    settings: parseSettings([]),
    ...over,
  };
}

const byId = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("buildTrackingRows", () => {
  test("shops are named and assigned as in HR's database; the owner still decides who may edit", () => {
    const rows = buildTrackingRows(
      data({ branches: [branch({ branch_code: "BKK-012", branch_name: "เซ็นทรัลลาดพร้าว", full_name: "ID 12_BN_Central_Ladprao", ta: "Chuthathip" }), branch({ branch_code: "CNX-001", branch_name: "เซ็นทรัลเฟสติวัล", region: "ภาคเหนือ" })] }),
      mind,
      today,
      { mineOnly: false },
    );
    const v1 = rows.find((r) => r.id === "V1")!;
    expect(v1).toMatchObject({ branchName: "ID 12_BN_Central_Ladprao", ta: "chuthathip", taName: "Chuthathip", taEmail: "mind@example.com", canEdit: true });
    // A shop without a database name or TA: the name is built from its code, the TA is the owner.
    expect(rows.find((r) => r.id === "N1")).toMatchObject({ branchName: "ID CNX-001_เซ็นทรัลเฟสติวัล", ta: "other@example.com", taName: "other@example.com" });
  });

  test("only on-process statuses", () => {
    const rows = buildTrackingRows(data(), ju, today, { mineOnly: false });
    expect(byId(rows)).toEqual(["N1", "O1", "PC", "PH", "U1", "V1"]);
  });

  test("open vacancy past SLA", () => {
    const v = buildTrackingRows(data(), ju, today, { mineOnly: false }).find((r) => r.id === "V1")!;
    expect(v).toMatchObject({ tat: 46, tatResult: "NotMeet", agingBand: "orange", taName: "มายด์", upcoming: false });
  });

  test("offered row stops TAT at offer date", () => {
    const o = buildTrackingRows(data(), ju, today, { mineOnly: false }).find((r) => r.id === "O1")!;
    expect(o).toMatchObject({ tat: 18, tatResult: "Meet", offerName: "นายสมชาย ใจดี", offerDate: "2026-10-20", agingBand: null });
  });

  test("rows carry their branch's AM and RM; an unknown branch has none", () => {
    const d = data({ branches: [branch({ branch_code: "BKK-012", am: "ก", rm: "R" })] });
    const rows = buildTrackingRows(d, ju, today, { mineOnly: false });
    expect(rows.find((r) => r.id === "V1")).toMatchObject({ am: "ก", rm: "R" });
    expect(rows.find((r) => r.id === "N1")).toMatchObject({ am: "", rm: "" });
  });

  test("an offered row carries the Offer for editing: start date, edit window, and the phone only for people who can edit", () => {
    const d = data({ offers: [offer({ id: "OF1", req_id: "O1", offer_date: "2026-10-20", phone: "0812345678", planned_start_date: "2026-11-01", created_at: "2026-10-20T03:00:00.000Z" })] });
    const o = buildTrackingRows(d, ju, today, { mineOnly: false }).find((r) => r.id === "O1")!;
    expect(o.offer).toEqual({ title: "นาย", firstName: "สมชาย", lastName: "ใจดี", phone: "0812345678", channel: "JobThai", startDate: "2026-11-01", editableUntil: "2026-10-20T05:00:00.000Z" });
    expect(o.startOverdue).toBe(true);
    expect(buildTrackingRows(d, boss, today, { mineOnly: false }).find((r) => r.id === "O1")!.offer?.phone).toBe("");
    expect(buildTrackingRows(d, ju, today, { mineOnly: false }).find((r) => r.id === "V1")).toMatchObject({ offer: null, startOverdue: false });
  });

  test("filterTrackingRows: the page's filters, so the export matches the screen", () => {
    const d = data({ branches: [branch({ branch_code: "BKK-012", branch_name: "เซ็นทรัลลาดพร้าว", region: "ภาคกลาง", am: "ก" }), branch({ branch_code: "CNX-001", branch_name: "เซ็นทรัลเฟสติวัล", region: "ภาคเหนือ", province: "เชียงใหม่" })] });
    const rows = buildTrackingRows(d, ju, today, { mineOnly: false });
    expect(byId(filterTrackingRows(rows, { status: "Pending" }))).toEqual(["PC", "PH"]);
    expect(byId(filterTrackingRows(rows, { status: "Offer" }))).toEqual(["O1"]);
    expect(byId(filterTrackingRows(rows, { region: "ภาคเหนือ" }))).toEqual(["N1"]);
    expect(byId(filterTrackingRows(rows, { q: "เฟสติวัล" }))).toEqual(["N1"]);
    expect(byId(filterTrackingRows(rows, { am: "ก", band: "orange", status: "Vacancy" }))).toEqual(["V1"]);
    expect(byId(filterTrackingRows(rows, { from: "2026-11-01", to: "2026-11-30" }))).toEqual(["U1"]);
    expect(filterTrackingRows(rows, {})).toHaveLength(rows.length);
  });

  test("upcoming vacancy is flagged with zero TAT", () => {
    const u = buildTrackingRows(data(), ju, today, { mineOnly: false }).find((r) => r.id === "U1")!;
    expect(u).toMatchObject({ upcoming: true, tat: 0, agingBand: "green" });
  });

  test("viewer scope filters by region", () => {
    const rows = buildTrackingRows(data(), { ...boss, scope: "ภาคเหนือ" }, today, { mineOnly: false });
    expect(byId(rows)).toEqual(["N1"]);
  });

  test("mineOnly keeps the viewer's own rows", () => {
    const rows = buildTrackingRows(data(), mind, today, { mineOnly: true });
    expect(byId(rows)).toEqual(["O1", "PC", "PH", "U1", "V1"]);
    expect(rows.every((r) => r.canEdit)).toBe(true);
  });

  test("unknown branch is kept, not dropped", () => {
    const d = data({ requisitions: [req({ id: "X1", branch_code: "ZZZ-999" })] });
    const [row] = buildTrackingRows(d, ju, today, { mineOnly: false });
    expect(row).toMatchObject({ id: "X1", branchName: "ID ZZZ-999", region: "ไม่ระบุ" });
  });

  test("sorted by region, branch, position, request date", () => {
    const d = data({
      requisitions: [
        req({ id: "b", position_code: "SM", request_date: "2026-09-01" }),
        req({ id: "a2", request_date: "2026-10-05" }),
        req({ id: "a1", request_date: "2026-10-01" }),
        req({ id: "n", branch_code: "CNX-001" }),
      ],
    });
    const rows = buildTrackingRows(d, ju, today, { mineOnly: false });
    expect(rows.map((r) => r.id)).toEqual(["a1", "a2", "b", "n"]);
  });
});
