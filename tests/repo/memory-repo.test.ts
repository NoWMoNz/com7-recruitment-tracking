import { beforeEach, describe, expect, test } from "vitest";
import { MemoryRepo } from "@/lib/repo/memory-repo";
import { ConflictError, NotFoundError } from "@/lib/repo/types";
import { fixtures } from "@/lib/repo/fixtures";

let repo: MemoryRepo;
beforeEach(() => {
  repo = new MemoryRepo(fixtures);
});

describe("MemoryRepo", () => {
  test("list returns fixtures", async () => {
    const reqs = await repo.list("Requisitions");
    expect(reqs.length).toBe(fixtures.Requisitions!.length);
    expect(reqs.find((r) => r.id === "REQ-0001")).toBeDefined();
  });

  test("update bumps version", async () => {
    const before = (await repo.getFresh("Requisitions", "REQ-0001"))!;
    const after = await repo.update("Requisitions", "REQ-0001", { status: "Offer" }, before.version);
    expect(after.version).toBe(before.version + 1);
    expect(after.status).toBe("Offer");
    expect(after.updated_at).not.toBe("");
  });

  test("stale version is a conflict", async () => {
    const v = (await repo.getFresh("Requisitions", "REQ-0001"))!.version;
    await repo.update("Requisitions", "REQ-0001", { status: "Offer" }, v);
    await expect(repo.update("Requisitions", "REQ-0001", { status: "Vacancy" }, v)).rejects.toBeInstanceOf(ConflictError);
  });

  test("unknown id is not found", async () => {
    await expect(repo.update("Requisitions", "NOPE", { status: "Offer" })).rejects.toBeInstanceOf(NotFoundError);
  });

  test("remove deletes the row; unknown id is not found", async () => {
    await repo.remove("Offers", "OFF-0002");
    expect((await repo.list("Offers")).some((o) => o.id === "OFF-0002")).toBe(false);
    await expect(repo.remove("Offers", "OFF-0002")).rejects.toBeInstanceOf(NotFoundError);
  });

  test("updateMany is all-or-nothing on a stale version", async () => {
    await expect(
      repo.updateMany("Requisitions", [
        { id: "REQ-0001", patch: { status: "Hold" }, expectedVersion: 1 },
        { id: "REQ-0004", patch: { status: "Hold" }, expectedVersion: 7 },
      ]),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.getFresh("Requisitions", "REQ-0001"))!.status).toBe("Vacancy");
    await repo.updateMany("Requisitions", [{ id: "REQ-0001", patch: { status: "Hold" }, expectedVersion: 1 }]);
    expect((await repo.getFresh("Requisitions", "REQ-0001"))!.version).toBe(2);
  });

  test("listNumbered numbers rows from 2; updateAt patches by row number", async () => {
    await repo.append("Import_Initial", [{ branch_code: "B1" }, { branch_code: "B2" }] as never);
    const rows = await repo.listNumbered("Import_Initial");
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
    await repo.updateAt("Import_Initial", [{ rowNumber: 3, patch: { processed_at: "now" } as never }]);
    expect((await repo.list("Import_Initial"))[1].processed_at).toBe("now");
  });

  test("removeAt deletes by row number", async () => {
    await repo.append("Import_Initial", [{ branch_code: "B1" }, { branch_code: "B2" }, { branch_code: "B3" }] as never);
    await repo.removeAt("Import_Initial", [2, 4]);
    expect((await repo.list("Import_Initial")).map((r) => r.branch_code)).toEqual(["B2"]);
  });

  test("append then list", async () => {
    await repo.append("SourcingChannels", [{ channel: "TikTok", active: true }]);
    const channels = await repo.list("SourcingChannels");
    expect(channels.some((c) => c.channel === "TikTok")).toBe(true);
  });

  test("does not mutate the shared fixtures", async () => {
    await repo.update("Requisitions", "REQ-0001", { status: "Cancel" });
    expect(fixtures.Requisitions!.find((r) => r.id === "REQ-0001")!.status).not.toBe("Cancel");
  });
});

describe("fixtures", () => {
  test("cover every on-process status, an upcoming row, a hold history and three roles", () => {
    const reqs = fixtures.Requisitions!;
    for (const s of ["Vacancy", "Offer", "PendingCancel", "PendingHold", "Hold", "Cancel", "Hired"]) {
      expect(reqs.some((r) => r.status === s), s).toBe(true);
    }
    expect(reqs.some((r) => r.request_date > "2026-11-17")).toBe(true);
    expect(fixtures.StatusLog!.some((e) => e.to_status === "Hold")).toBe(true);
    expect(new Set(fixtures.Users!.map((u) => u.role))).toEqual(new Set(["super_admin", "ta", "viewer"]));
    const offerIds = new Set(fixtures.Offers!.map((o) => o.id));
    for (const r of reqs.filter((r) => r.status === "Offer")) expect(offerIds.has(r.offer_id)).toBe(true);
  });
});
