import type { StatusLogEntry } from "./types";

const byEffective = (a: StatusLogEntry, b: StatusLogEntry) => a.effective_date.localeCompare(b.effective_date) || a.at.localeCompare(b.at);
const EMPTY: readonly StatusLogEntry[] = [];

/**
 * Status-log rows grouped by requisition, built once per log array. Pages ask for one requisition's rows many
 * times (once per row on screen); scanning the whole log each time grew with rows × log and made pages slow as
 * the log grew. The group is rebuilt if the array grew since (the processor appends to the log it is given).
 */
const cache = new WeakMap<readonly StatusLogEntry[], { length: number; byReq: Map<string, StatusLogEntry[]> }>();

function grouped(log: readonly StatusLogEntry[]): Map<string, StatusLogEntry[]> {
  const hit = cache.get(log);
  if (hit && hit.length === log.length) return hit.byReq;
  const byReq = new Map<string, StatusLogEntry[]>();
  for (const e of log) {
    const list = byReq.get(e.req_id);
    if (list) list.push(e);
    else byReq.set(e.req_id, [e]);
  }
  for (const list of byReq.values()) list.sort(byEffective);
  cache.set(log, { length: log.length, byReq });
  return byReq;
}

/** One requisition's log rows, oldest first (effective date, then the time they were written). */
export function entriesOf(log: readonly StatusLogEntry[], reqId: string): readonly StatusLogEntry[] {
  return grouped(log).get(reqId) ?? EMPTY;
}
