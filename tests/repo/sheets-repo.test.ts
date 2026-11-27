import { beforeEach, describe, expect, test } from "vitest";
import { SheetsRepo, type SheetsValuesApi } from "@/lib/repo/sheets-repo";
import { ConflictError, MissingColumnError, NotFoundError } from "@/lib/repo/types";
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
  clears: string[] = [];
  batches: { range: string; values: unknown[][] }[][] = [];
  gets: string[] = [];
  batchGets: string[][] = [];
  /** Tabs the spreadsheet does not have: Google refuses any request that names one. */
  missing = new Set<string>();

  private refuseMissing(range: string) {
    if (this.missing.has(range.split("!")[0])) throw new Error(`Unable to parse range: ${range}`);
  }

  async batchGet(p: { ranges: string[] }) {
    this.batchGets.push(p.ranges);
    p.ranges.forEach((r) => this.refuseMissing(r));
    return { data: { valueRanges: p.ranges.map((r) => ({ range: r, values: this.tabs[r.split("!")[0]] ?? [] })) } };
  }
  async get(p: { range: string }) {
    this.gets.push(p.range);
    this.refuseMissing(p.range);
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
  async batchUpdate(p: { requestBody: { data: { range: string; values: unknown[][] }[] } }) {
    this.batches.push(p.requestBody.data);
    return {};
  }
  async clear(p: { range: string }) {
    this.clears.push(p.range);
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
        source_ref: "", ta_email: "", ta_name: "", status: "Vacancy", status_date: null, offer_id: "", closed_at: null, version: 1,
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

describe("SheetsRepo reads tabs asked for together in one request (Sheets allows 60 reads a minute)", () => {
  beforeEach(() => {
    api.tabs.Users = [TABS.Users.columns.map((c) => c.key)];
  });

  test("list() calls made together cost one batchGet", async () => {
    const [users, reqs] = await Promise.all([repo.list("Users"), repo.list("Requisitions")]);
    expect(reqs.map((r) => r.id)).toEqual(["REQ-3", "REQ-1", "REQ-2"]);
    expect(users).toEqual([]);
    expect(api.batchGets).toEqual([["Requisitions!A:ZZ", "Users!A:ZZ"]]);
    expect(api.gets).toEqual([]);
  });

  test("a tab asked for twice is read once", async () => {
    await Promise.all([repo.list("Requisitions"), repo.list("Users"), repo.list("Requisitions")]);
    expect(api.batchGets).toEqual([["Requisitions!A:ZZ", "Users!A:ZZ"]]);
  });

  test("a tab read on its own still uses a plain get", async () => {
    await repo.list("Requisitions");
    expect(api.gets).toEqual(["Requisitions!A:ZZ"]);
    expect(api.batchGets).toEqual([]);
  });

  test("a missing tab fails only its own caller", async () => {
    api.missing.add("Logins");
    const [reqs, logins] = await Promise.allSettled([repo.list("Requisitions"), repo.list("Logins")]);
    expect(reqs.status).toBe("fulfilled");
    expect(logins.status).toBe("rejected");
    expect(String((logins as PromiseRejectedResult).reason)).toMatch(/unable to parse range/i);
  });

  test("fresh listNumbered() calls made together are batched too", async () => {
    await Promise.all([repo.listNumbered("Requisitions"), repo.listNumbered("Users")]);
    expect(api.batchGets).toHaveLength(1);
    expect(api.gets).toEqual([]);
  });

  test("cached reads ask the cache once, for the sorted set of tabs", async () => {
    const asked: string[][] = [];
    const cachedRepo = new SheetsRepo({
      api,
      sheetId: "x",
      readCachedMany: async (tabs) => {
        asked.push([...tabs]);
        return tabs.map((t) => api.tabs[t] ?? []);
      },
    });
    const [users, reqs] = await Promise.all([cachedRepo.list("Users"), cachedRepo.list("Requisitions")]);
    expect(users).toEqual([]);
    expect(reqs).toHaveLength(3);
    expect(asked).toEqual([["Requisitions", "Users"]]);
    expect(api.gets).toEqual([]);
    expect(api.batchGets).toEqual([]);
  });

  test("a cached read asked for while the same tab is being read joins it; after a save it reads again", async () => {
    const asked: string[][] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const cachedRepo = new SheetsRepo({
      api,
      sheetId: "x",
      readCachedMany: async (tabs) => {
        asked.push([...tabs]);
        await gate;
        return tabs.map((t) => api.tabs[t] ?? []);
      },
    });
    const first = cachedRepo.list("Users");
    await Promise.resolve();
    await Promise.resolve();
    const second = cachedRepo.list("Users");
    release();
    await Promise.all([first, second]);
    expect(asked).toEqual([["Users"]]);

    await cachedRepo.invalidate("Users");
    await cachedRepo.list("Users");
    expect(asked).toEqual([["Users"], ["Users"]]);
  });
});

describe("SheetsRepo.remove", () => {
  test("blanks the matching row and invalidates the tab", async () => {
    await repo.remove("Requisitions", "REQ-1");
    expect(api.clears).toEqual(["Requisitions!A4:4"]);
    expect(invalidated).toContain("Requisitions");
  });

  test("unknown id is not found", async () => {
    await expect(repo.remove("Requisitions", "NOPE")).rejects.toBeInstanceOf(NotFoundError);
    expect(api.clears).toEqual([]);
  });
});

describe("SheetsRepo batch writes", () => {
  test("updateMany writes every row in one batch and bumps versions", async () => {
    await repo.updateMany("Requisitions", [
      { id: "REQ-1", patch: { status: "Offer" }, expectedVersion: 2 },
      { id: "REQ-2", patch: { status: "Hold" }, expectedVersion: 1 },
    ]);
    expect(api.batches).toHaveLength(1);
    expect(api.batches[0].map((d) => d.range)).toEqual(["Requisitions!A4", "Requisitions!A5"]);
    expect(api.batches[0][0].values[0][header.indexOf("version")]).toBe(3);
    expect(invalidated).toContain("Requisitions");
  });

  test("updateMany writes nothing when one version is stale", async () => {
    await expect(
      repo.updateMany("Requisitions", [
        { id: "REQ-1", patch: { status: "Offer" }, expectedVersion: 2 },
        { id: "REQ-2", patch: { status: "Hold" }, expectedVersion: 9 },
      ]),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(api.batches).toEqual([]);
  });

  test("listNumbered keeps real row numbers across blank rows; updateAt patches by row number", async () => {
    const rows = await repo.listNumbered("Requisitions");
    expect(rows.map((r) => [r.rowNumber, r.row.id])).toEqual([[2, "REQ-3"], [4, "REQ-1"], [5, "REQ-2"]]);
    await repo.updateAt("Requisitions", [{ rowNumber: 4, patch: { source_ref: "x" } }]);
    expect(api.batches[0][0].range).toBe("Requisitions!A4");
    expect(api.batches[0][0].values[0][header.indexOf("source_ref")]).toBe("x");
    expect(api.batches[0][0].values[0][header.indexOf("version")]).toBe(2);
  });
});

describe("SheetsRepo with an old header (a column added since the sheet was set up)", () => {
  const oldHeader = TABS.Import_Resign.columns.map((c) => c.key).filter((k) => !k.startsWith("cancel"));
  const resignRow = ["E100", "นาย", "ก", "ข", "BKK-012", "SALES", 46346, "2026-11-17T17:30:00Z"];

  beforeEach(() => {
    api.tabs.Import_Resign = [oldHeader, resignRow];
  });

  test("updateAt refuses a patch that names a missing column and writes nothing", async () => {
    await expect(repo.updateAt("Import_Resign", [{ rowNumber: 2, patch: { cancelled_at: "2026-11-20T03:00:00Z" } }])).rejects.toBeInstanceOf(MissingColumnError);
    await expect(repo.updateAt("Import_Resign", [{ rowNumber: 2, patch: { cancelled_at: "x" } }])).rejects.toThrow(/cancelled_at.*pnpm sheet:setup/);
    expect(api.batches).toEqual([]);
  });

  test("a patch that only names columns the sheet has still works", async () => {
    await repo.updateAt("Import_Resign", [{ rowNumber: 2, patch: { processed_at: "later" } }]);
    expect(api.batches[0][0].values[0][oldHeader.indexOf("processed_at")]).toBe("later");
  });

  test("requireColumns passes for present columns and names the missing ones", async () => {
    await expect(repo.requireColumns("Import_Resign", ["processed_at"])).resolves.toBeUndefined();
    await expect(repo.requireColumns("Import_Resign", ["cancelled_at", "cancel_note"])).rejects.toThrow(/cancelled_at, cancel_note/);
  });
});
