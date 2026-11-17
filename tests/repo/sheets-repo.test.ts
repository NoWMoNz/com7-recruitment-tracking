import { beforeEach, describe, expect, test } from "vitest";
import { SheetsRepo, type SheetsValuesApi } from "@/lib/repo/sheets-repo";
import { ConflictError, NotFoundError } from "@/lib/repo/types";
import { TABS } from "@/lib/sheets/schema";

const header = TABS.Requisitions.columns.map((c) => c.key);

function reqRow(id: string, version: number, status = "Vacancy"): unknown[] {
  const obj: Record<string, unknown> = {
    id, branch_code: "BKK-012", position_code: "SALES", request_date: 46297, status, version, ta_email: "mind@example.com",
  };
  return header.map((h) => obj[h] ?? "");
}

class FakeValues implements SheetsValuesApi {
  tabs: Record<string, unknown[][]> = {};
  updates: { range: string; values: unknown[][]; valueInputOption: string }[] = [];
  appends: { range: string; values: unknown[][]; valueInputOption: string }[] = [];
  gets: string[] = [];

  async get(p: { range: string }) {
    this.gets.push(p.range);
    const tab = p.range.split("!")[0];
    const values = this.tabs[tab] ?? [];
    return { data: { values: p.range.endsWith("!1:1") ? values.slice(0, 1) : values } };
  }
  async update(p: { range: string; valueInputOption: string; requestBody: { values: unknown[][] } }) {
    this.updates.push({ range: p.range, values: p.requestBody.values, valueInputOption: p.valueInputOption });
    return {};
  }
  async append(p: { range: string; valueInputOption: string; requestBody: { values: unknown[][] } }) {
    this.appends.push({ range: p.range, values: p.requestBody.values, valueInputOption: p.valueInputOption });
    return {};
  }
}

let api: FakeValues;
let invalidated: string[];
let repo: SheetsRepo;

beforeEach(() => {
  api = new FakeValues();
  api.tabs.Requisitions = [header, reqRow("REQ-3", 1), [], reqRow("REQ-1", 2), reqRow("REQ-2", 1)];
  invalidated = [];
  repo = new SheetsRepo({ api, sheetId: "x", invalidate: async (t) => void invalidated.push(t) });
});

describe("SheetsRepo.update", () => {
  test("locates the row by id even with blank rows in between", async () => {
    const updated = await repo.update("Requisitions", "REQ-1", { status: "Offer" }, 2);
    expect(api.updates).toHaveLength(1);
    expect(api.updates[0].range).toBe("Requisitions!A4");
    expect(api.updates[0].valueInputOption).toBe("RAW");
    const written = api.updates[0].values[0];
    expect(written[header.indexOf("status")]).toBe("Offer");
    expect(written[header.indexOf("version")]).toBe(3);
    expect(written[header.indexOf("request_date")]).toBe(46297);
    expect(updated.version).toBe(3);
  });

  test("stale version raises ConflictError and writes nothing", async () => {
    await expect(repo.update("Requisitions", "REQ-1", { status: "Offer" }, 1)).rejects.toBeInstanceOf(ConflictError);
    expect(api.updates).toHaveLength(0);
  });

  test("missing id raises NotFoundError", async () => {
    await expect(repo.update("Requisitions", "REQ-9", { status: "Offer" })).rejects.toBeInstanceOf(NotFoundError);
  });

  test("invalidates the tab cache", async () => {
    await repo.update("Requisitions", "REQ-1", { status: "Offer" }, 2);
    expect(invalidated).toEqual(["Requisitions"]);
  });
});

describe("SheetsRepo.append", () => {
  test("uses RAW input and serial dates in sheet header order", async () => {
    await repo.append("Requisitions", [
      {
        id: "REQ-4", branch_code: "CNX-001", position_code: "SM", request_date: "2026-11-17", source: "NewStore",
        source_ref: "", ta_email: "", status: "Vacancy", status_date: null, offer_id: "", closed_at: null, version: 1,
        created_at: "", updated_at: "",
      },
    ]);
    expect(api.appends).toHaveLength(1);
    expect(api.appends[0].valueInputOption).toBe("RAW");
    expect(api.appends[0].values[0][header.indexOf("request_date")]).toBe(46343);
    expect(invalidated).toEqual(["Requisitions"]);
  });

  test("refuses to append to a tab with no header", async () => {
    await expect(repo.append("Offers", [])).rejects.toThrow(/Offers/);
  });
});

describe("SheetsRepo.list / getFresh", () => {
  test("list parses rows and skips blanks", async () => {
    const rows = await repo.list("Requisitions");
    expect(rows.map((r) => r.id)).toEqual(["REQ-3", "REQ-1", "REQ-2"]);
    expect(rows[1].request_date).toBe("2026-10-02");
  });

  test("getFresh returns one row or null", async () => {
    expect((await repo.getFresh("Requisitions", "REQ-2"))?.version).toBe(1);
    expect(await repo.getFresh("Requisitions", "REQ-9")).toBeNull();
  });
});
