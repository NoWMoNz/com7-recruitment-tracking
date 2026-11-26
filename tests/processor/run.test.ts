import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
// run.ts only needs the Repo type and a default; the tests pass their own MemoryRepo.
vi.mock("@/lib/repo", () => ({ getRepo: () => { throw new Error("pass a repo"); } }));

const { runProcessor } = await import("@/lib/processor/run");
const { MemoryRepo } = await import("@/lib/repo/memory-repo");
const { fixtures } = await import("@/lib/repo/fixtures");

describe("runProcessor on the demo dataset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T03:00:00.000Z")); // 18/11/2026 10:00 Bangkok
  });
  afterEach(() => vi.useRealTimers());

  test("applies imports and the store closure, then a second run changes nothing", async () => {
    const repo = new MemoryRepo(fixtures);
    const first = await runProcessor("ju@example.com", repo);
    expect(first).toMatchObject({
      created: 2 /* resigns */ + 3 /* transfer-out vacancies */ + 2 /* new store */,
      transferred: 1,
      cancelled: 1,
      hired: 1,
      review: 3, // transfer with no vacancy, unmatched hire (name typo), Offer at the closed store
      waiting: 1,
    });
    expect(first.skipped).toEqual([{ tab: "Import_Resign", rowNumber: 4, reason: 'ไม่พบรหัสสาขา "XXX-999"' }]);

    const reqs = await repo.list("Requisitions");
    expect(reqs.find((r) => r.id === "REQ-0002")).toMatchObject({ status: "Hired", closed_at: "2026-11-18" });
    expect(reqs.find((r) => r.id === "REQ-0013")).toMatchObject({ status: "Transfer", closed_at: "2026-11-15" });
    expect(reqs.find((r) => r.id === "REQ-0026")).toMatchObject({ status: "Cancel", closed_at: "2026-11-15" });
    expect(reqs.find((r) => r.id === "REQ-0027")!.status).toBe("Offer");
    // The demo already has two hires (E3101, E3102); the run adds the one matched person.
    expect((await repo.list("NewHires")).map((h) => [h.employee_id, h.first_name]).slice(-1)).toEqual([["E3001", "สมชาย"]]);
    expect(await repo.list("NewHires")).toHaveLength(3);
    expect((await repo.list("Offers")).some((o) => o.id === "OFF-0002")).toBe(false);
    expect((await repo.list("Import_Resign")).map((r) => Boolean(r.processed_at))).toEqual([true, true, false]);
    expect((await repo.list("Import_Transfer")).map((r) => Boolean(r.processed_at))).toEqual([true, true, false]);

    const counts = async () => Object.fromEntries(await Promise.all((["Requisitions", "Offers", "NewHires", "StatusLog", "ReviewQueue"] as const).map(async (t) => [t, (await repo.list(t)).length])));
    const before = await counts();
    expect(first.closedMonth).toBe("2026-10");
    const snaps = await repo.list("MonthlySnapshots");
    expect(snaps.length).toBeGreaterThan(0);
    expect(snaps.every((s) => s.month === "2026-10")).toBe(true);

    const second = await runProcessor("system", repo);
    expect(second).toMatchObject({ created: 0, transferred: 0, cancelled: 0, hired: 0, review: 0, closedMonth: null });
    expect(await counts()).toEqual(before);
    expect((await repo.list("MonthlySnapshots")).length).toBe(snaps.length);
  });
});
