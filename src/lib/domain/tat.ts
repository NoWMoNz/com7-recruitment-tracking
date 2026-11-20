import { daysBetween } from "./dates";
import { entriesOf } from "./log-index";
import type { LocalDate, StatusLogEntry } from "./types";

export type TatResult = "Meet" | "NotMeet" | "InProgress";
export type AgingBand = "green" | "orange" | "red" | "darkred";

function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a < b ? a : b;
}

/** Total days a requisition spent in Hold, counting only time up to `asOf`. */
export function holdDays(log: StatusLogEntry[], reqId: string, asOf: LocalDate): number {
  const entries = entriesOf(log, reqId);
  let total = 0;
  let openedAt: LocalDate | null = null;
  const close = (end: LocalDate) => {
    if (openedAt === null) return;
    total += Math.max(0, daysBetween(openedAt, minDate(end, asOf)));
    openedAt = null;
  };
  for (const e of entries) {
    if (e.from_status === "Hold") close(e.effective_date);
    if (e.to_status === "Hold") openedAt = e.effective_date;
  }
  close(asOf);
  return total;
}

export function computeTat(args: { requestDate: LocalDate; endDate: LocalDate; holdDays: number }): number {
  return Math.max(0, daysBetween(args.requestDate, args.endDate) - args.holdDays);
}

export function tatResult(tat: number, hasOffer: boolean, sla: number): TatResult {
  if (hasOffer) return tat <= sla ? "Meet" : "NotMeet";
  return tat > sla ? "NotMeet" : "InProgress";
}

export function agingBand(days: number, bands: [number, number, number]): AgingBand {
  if (days <= bands[0]) return "green";
  if (days <= bands[1]) return "orange";
  if (days <= bands[2]) return "red";
  return "darkred";
}
