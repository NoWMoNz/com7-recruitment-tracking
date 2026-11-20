import type { ReactNode } from "react";
import { BAND_LABEL } from "@/components/aging-badge";
import type { RowStats } from "@/lib/domain/dashboard";
import { formatThaiDate } from "@/lib/domain/dates";
import type { AgingBand } from "@/lib/domain/tat";
import type { TrackingRow } from "@/lib/domain/tracking";
import { TipNote, TipRow, TipTitle } from "./hover-tip";

/**
 * Lights the provinces of the rows that match (null clears it). Cards call it on hover; the map listens.
 * Give a `label` and the summary card also re-describes itself for that slice ("ภาคเหนือ มี 12 ตำแหน่ง …").
 */
export type SpotFn = (match: ((r: TrackingRow) => boolean) | null, label?: string) => void;

/** What the summary card says while a card that is not a list of requisitions (approvals, a month, a meter) is pointed at. */
export interface SummaryNote {
  label: string;
  text: ReactNode;
  sub?: ReactNode;
  /** Provinces to light on the map. */
  provinces?: string[];
  /** Figures for the band chips; the overall ones stay when absent. */
  stats?: RowStats;
}
export type NoteFn = (note: SummaryNote | null) => void;

export const BANDS: AgingBand[] = ["green", "orange", "red", "darkred"];
/** Same hues as the aging badges, kept as raw colours for the dark tooltip. */
export const BAND_DOT: Record<AgingBand, string> = { green: "#2a8638", orange: "#ea580c", red: "#dc2626", darkred: "#b91c1c" };

/** Link into the tracking page with its search / band / status / region preset. */
export function trackingHref(p: { q?: string; band?: AgingBand; status?: string; region?: string; bu?: string }): string {
  const qs = new URLSearchParams({ mine: "0" });
  for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);
  return `/tracking?${qs}`;
}

const place = (r: TrackingRow) => `${r.positionName} · ${r.branchName}`;

/** Counts, aging split and the longest-waiting vacancy for any slice of rows. */
export function StatsTip({ title, sub, s, hint }: { title: ReactNode; sub?: ReactNode; s: RowStats; hint?: ReactNode }) {
  const vacant = BANDS.reduce((n, b) => n + s.bands[b], 0);
  return (
    <>
      <TipTitle sub={sub}>{title}</TipTitle>
      <TipRow label="เปิดสรรหา" value={s.open} />
      <TipRow label="Offer แล้ว" value={s.offers} />
      <TipRow label="เกินเกณฑ์ TAT" value={s.notMeet} tone={s.notMeet > 0 ? "bad" : undefined} />
      <TipRow label="ว่างค้างเฉลี่ย" value={s.avgAging === null ? "-" : `${s.avgAging} วัน`} />
      {vacant > 0 && (
        <TipNote>
          {BANDS.map((b) => (
            <TipRow key={b} dot={BAND_DOT[b]} label={BAND_LABEL[b]} value={s.bands[b]} />
          ))}
        </TipNote>
      )}
      {s.oldest && (
        <TipNote>
          ค้างนานสุด {s.oldest.tat} วัน
          <br />
          {place(s.oldest)}
        </TipNote>
      )}
      {hint && <TipNote>{hint}</TipNote>}
    </>
  );
}

/** One requisition in full: where, who, how long, and the Offer if there is one. */
export function RowTip({ r, extra }: { r: TrackingRow; extra?: ReactNode }) {
  const over = r.tat - r.slaDays;
  return (
    <>
      <TipTitle sub={`${r.region}${r.province ? ` · ${r.province}` : ""}`}>{place(r)}</TipTitle>
      <TipRow label="รหัส" value={r.id} />
      <TipRow label="ผู้รับผิดชอบ" value={r.taName || "-"} />
      <TipRow label="วันที่แจ้งสรรหา" value={formatThaiDate(r.requestDate)} />
      <TipRow label="TAT / SLA" value={`${r.tat} / ${r.slaDays} วัน`} tone={over > 0 ? "bad" : undefined} />
      {r.holdDays > 0 && <TipRow label="หักช่วงพัก" value={`${r.holdDays} วัน`} />}
      {r.status === "Offer" && r.offerName && (
        <TipNote>
          <TipRow label="ผู้ได้รับ Offer" value={r.offerName} />
          <TipRow label="วันที่ Offer" value={formatThaiDate(r.offerDate)} />
          {r.offerChannel && <TipRow label="ช่องทาง" value={r.offerChannel} />}
        </TipNote>
      )}
      {(r.status === "PendingCancel" || r.status === "PendingHold") && <TipNote>{r.status === "PendingCancel" ? "รออนุมัติยกเลิก" : "รออนุมัติพัก (Hold)"}</TipNote>}
      {extra}
    </>
  );
}

/** First few items of a list, with "+ N more" so a long list never grows the tooltip. */
export function ListTip({ title, items, total, empty }: { title: ReactNode; items: { label: ReactNode; value: ReactNode }[]; total: number; empty: string }) {
  return (
    <>
      <TipTitle>{title}</TipTitle>
      {items.length === 0 ? (
        <div className="text-foreground/60">{empty}</div>
      ) : (
        items.map((it, i) => <TipRow key={i} label={it.label} value={it.value} />)
      )}
      {total > items.length && <TipNote>และอีก {total - items.length} รายการ</TipNote>}
    </>
  );
}
