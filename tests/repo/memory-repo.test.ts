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
