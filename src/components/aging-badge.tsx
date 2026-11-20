import type { AgingBand, TatResult } from "@/lib/domain/tat";
import { cn } from "@/lib/utils";

export const BAND_CLASS: Record<AgingBand, string> = {
  green: "bg-[#2a8638] text-white",
  orange: "bg-[#ea580c] text-white",
  red: "bg-[#dc2626] text-white",
  darkred: "bg-[#7f1d1d] text-white",
};

export const BAND_LABEL: Record<AgingBand, string> = {
  green: "0–30 วัน",
  orange: "31–60 วัน",
  red: "61–90 วัน",
  darkred: "เกิน 90 วัน",
};

/** TAT day count; coloured by aging band when the row is still open. Text always carries the number. */
export function TatBadge({ tat, band }: { tat: number; band: AgingBand | null }) {
  return (
    <span
      title={band ? `Aging ${BAND_LABEL[band]}` : "TAT ถึงวันที่ Offer"}
      className={cn(
        "inline-flex min-w-12 justify-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums",
        band ? BAND_CLASS[band] : "bg-secondary text-secondary-foreground",
      )}
    >
      {tat} วัน
    </span>
  );
}

const RESULT_CLASS: Record<TatResult, string> = {
  Meet: "text-[#15803d]",
  NotMeet: "text-[#b91c1c]",
  InProgress: "text-muted-foreground",
};

const RESULT_LABEL: Record<TatResult, string> = {
  Meet: "Meet",
  NotMeet: "Not Meet",
  InProgress: "ภายใน SLA",
};

export function TatResultText({ result }: { result: TatResult }) {
  return <span className={cn("text-sm font-medium", RESULT_CLASS[result])}>{RESULT_LABEL[result]}</span>;
}
