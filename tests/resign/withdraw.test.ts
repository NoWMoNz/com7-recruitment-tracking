import { describe, expect, test, vi } from "vitest";
import { runWithdrawal } from "@/lib/resign/withdraw";
import { MemoryRepo } from "@/lib/repo/memory-repo";
import { ConflictError, MissingColumnError } from "@/lib/repo/types";
import type { ImportResign } from "@/lib/domain/types";
import { branch, offer, positions, req, user } from "../domain/helpers";

const NOW = new Date("2026-11-20T03:00:00Z");
const TODAY = "2026-11-20";
const mind = user({ email: "mind@example.com", name: "มายด์", role: "ta" });

const resign = (p: Partial<ImportResign> = {}): ImportResign => ({
  employee_id: "E100", title: "นาย", first_name: "ก", last_name: "ข", branch_code: "BKK-012", position_code: "SALES",
  effective_date: "2026-11-20", processed_at: "2026-11-17T17:30:00Z", cancelled_at: "", cancelled_by: "", cancel_note: "", ...p,
});
const REF = "RESIGN:E100:2026-11-20";

function repoWith(status: "Vacancy" | "Offer", extra: Partial<ImportResign>[] = []) {
  return new MemoryRepo({
    Import_Resign: [resign(), ...extra.map((e) => resign(e))],
    Requisitions: [req({ id: "R1", source_ref: REF, status, offer_id: status === "Offer" ? "O1" : "" })],
    Offers: status === "Offer" ? [offer({ id: "O1", req_id: "R1", first_name: "สมหญิง", last_name: "ใจงาม" })] : [],
    Branches: [branch({ branch_code: "BKK-012" })],
    Positions: positions,
    ReviewQueue: [],
    StatusLog: [],
    Users: [mind],
  });
}
const input = (p: Partial<{ rowNumber: number; employeeId: string; effectiveDate: string; note: string }> = {}) => ({
  rowNumber: 2, employeeId: "E100", effectiveDate: TODAY, note: "พนักงานขออยู่ต่อ", ...p,
});
const run = (repo: MemoryRepo, i = input()) => runWithdrawal(repo, mind, i, { now: NOW, today: TODAY });

describe("runWithdrawal after a partial failure", () => {
  test("retry after the log write failed adds the missing Cancel log row exactly once", async () => {
    const repo = repoWith("Vacancy");
    vi.spyOn(repo, "append").mockRejectedValueOnce(new Error("sheets down"));
    await expect(run(repo)).rejects.toThrow("sheets down");
    // The requisition was already closed; the log row and the mark are missing.
    expect((await repo.list("Requisitions"))[0].status).toBe("Cancel");
    expect(await repo.list("StatusLog")).toHaveLength(0);
    expect((await repo.list("Import_Resign"))[0].cancelled_at).toBe("");

    expect(await run(repo)).toEqual({ ok: true, value: { outcome: "cancelled" } });
    expect((await repo.list("StatusLog")).map((l) => [l.req_id, l.to_status, l.ref_id])).toEqual([["R1", "Cancel", REF]]);
    expect((await repo.list("Import_Resign"))[0].cancelled_by).toBe("mind@example.com");
    expect(await run(repo)).toMatchObject({ ok: false, errors: { form: "รายการนี้ยกเลิกลาออกไปแล้ว" } });
    expect(await repo.list("StatusLog")).toHaveLength(1);
  });

  test("a sheet without the withdrawal columns is refused before anything is written", async () => {
    const repo = repoWith("Vacancy");
    vi.spyOn(repo, "requireColumns").mockRejectedValueOnce(new MissingColumnError("Import_Resign", ["cancelled_at"]));
    await expect(run(repo)).rejects.toBeInstanceOf(MissingColumnError);
    expect((await repo.list("Requisitions"))[0].status).toBe("Vacancy");
    expect(await repo.list("StatusLog")).toHaveLength(0);
  });
});

describe("runWithdrawal", () => {
  test("a Vacancy is closed as Cancel, logged, and the import row records who and why", async () => {
    const repo = repoWith("Vacancy");
    expect(await run(repo)).toEqual({ ok: true, value: { outcome: "cancelled" } });
    expect((await repo.list("Requisitions"))[0]).toMatchObject({ status: "Cancel", closed_at: TODAY });
    expect((await repo.list("StatusLog")).map((l) => [l.req_id, l.from_status, l.to_status, l.ref_id])).toEqual([["R1", "Vacancy", "Cancel", REF]]);
    expect((await repo.list("Import_Resign"))[0]).toMatchObject({ cancelled_by: "mind@example.com", cancel_note: "พนักงานขออยู่ต่อ" });
    expect((await repo.list("ReviewQueue")).length).toBe(0);
  });

  test("an Offer is left alone and queued for review once; withdrawing again is refused and adds nothing", async () => {
    const repo = repoWith("Offer");
    expect(await run(repo)).toEqual({ ok: true, value: { outcome: "review" } });
    expect((await repo.list("Requisitions"))[0].status).toBe("Offer");
    const review = await repo.list("ReviewQueue");
    expect(review).toHaveLength(1);
    expect(review[0]).toMatchObject({ type: "ResignWithdrawn", ref: `RESIGNWD:${REF}` });
    expect(review[0].detail).toContain("สมหญิง");

    const again = await run(repo);
    expect(again).toEqual({ ok: false, errors: { form: "รายการนี้ยกเลิกลาออกไปแล้ว" } });
    expect(await repo.list("ReviewQueue")).toHaveLength(1);
    expect(await repo.list("StatusLog")).toHaveLength(0);
  });

  test("a stale row number (the row now holds someone else) is refused and nothing is written", async () => {
    const repo = repoWith("Vacancy", [{ employee_id: "E200" }]);
    const res = await run(repo, input({ rowNumber: 3 })); // row 3 is E200, the caller meant E100
    expect(res.ok).toBe(false);
    expect((await repo.list("Requisitions"))[0].status).toBe("Vacancy");
    expect((await repo.list("Import_Resign")).map((r) => r.cancelled_at)).toEqual(["", ""]);
    expect(await run(repo, input({ rowNumber: 9 }))).toMatchObject({ ok: false });
  });

  test("a version conflict on the requisition throws and leaves the import row unmarked, so it can be retried", async () => {
    const repo = repoWith("Vacancy");
    vi.spyOn(repo, "update").mockRejectedValueOnce(new ConflictError());
    await expect(run(repo)).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.list("Import_Resign"))[0].cancelled_at).toBe("");
    expect(await repo.list("StatusLog")).toHaveLength(0);
    expect(await run(repo)).toEqual({ ok: true, value: { outcome: "cancelled" } });
  });
});
