import { describe, expect, test } from "vitest";
import { entriesOf } from "@/lib/domain/log-index";
import { holdDays } from "@/lib/domain/tat";
import type { StatusLogEntry } from "@/lib/domain/types";

const e = (req_id: string, to_status: string, effective_date: string, from_status = "Vacancy", at = `${effective_date}T01:00:00Z`): StatusLogEntry => ({
  id: `${req_id}-${to_status}-${effective_date}-${at}`, req_id, from_status, to_status, effective_date, actor: "", at, note: "", ref_id: "",
});

describe("entriesOf", () => {
  test("returns one requisition's rows sorted by effective date, then by time written", () => {
    const log = [e("A", "Hold", "2026-11-10"), e("B", "Offer", "2026-11-01"), e("A", "Vacancy", "2026-11-05", "Hold", "2026-11-05T09:00:00Z"), e("A", "Offer", "2026-11-05", "Vacancy", "2026-11-05T02:00:00Z")];
    expect(entriesOf(log, "A").map((x) => [x.to_status, x.effective_date])).toEqual([
      ["Offer", "2026-11-05"],
      ["Vacancy", "2026-11-05"],
      ["Hold", "2026-11-10"],
    ]);
    expect(entriesOf(log, "B")).toHaveLength(1);
    expect(entriesOf(log, "nobody")).toEqual([]);
  });

  test("sees rows added to the same array after the first call", () => {
    const log = [e("A", "Hold", "2026-11-01")];
    expect(entriesOf(log, "A")).toHaveLength(1);
    log.push(e("A", "Vacancy", "2026-11-04", "Hold"));
    expect(entriesOf(log, "A")).toHaveLength(2);
    expect(holdDays(log, "A", "2026-11-20")).toBe(3);
  });

  test("a different array with the same length is not confused with the first", () => {
    const one = [e("A", "Hold", "2026-11-01")];
    const two = [e("B", "Hold", "2026-11-01")];
    expect(entriesOf(one, "A")).toHaveLength(1);
    expect(entriesOf(two, "A")).toHaveLength(0);
  });
});
