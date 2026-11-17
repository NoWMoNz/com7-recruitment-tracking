import { describe, expect, test } from "vitest";
import { buildTrackingRows, type TrackingData } from "@/lib/domain/tracking";
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
    expect(row).toMatchObject({ id: "X1", branchName: "ZZZ-999", region: "ไม่ระบุ" });
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
