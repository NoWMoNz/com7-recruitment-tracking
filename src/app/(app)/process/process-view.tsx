"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Link2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dropdown } from "@/components/ui/dropdown";
import type { RunSummary } from "@/lib/processor/run";
import type { ReviewType } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { matchHire, resolveReview, runProcessingNow } from "./actions";

export interface OfferOption {
  id: string;
  branchCode: string;
  positionCode: string;
  label: string;
}

export interface ReviewView {
  id: string;
  type: ReviewType;
  detail: string;
  branchCode: string | null;
  positionCode: string | null;
}

interface Props {
  pending: { tab: string; label: string; count: number }[];
  reviews: ReviewView[];
  offers: OfferOption[];
}

const REVIEW_LABEL: Record<ReviewType, string> = {
  UnmatchedHire: "รอจับคู่พนักงานใหม่",
  TransferNoReq: "โอนเข้าแต่ไม่มีตำแหน่งว่าง",
  OfferAtClosedStore: "ร้านปิดแต่มีคน Offer",
};
const REVIEW_HINT: Record<ReviewType, string> = {
  UnmatchedHire: "เลือกคน Offer ที่ตรงกับพนักงานคนนี้ ระบบจะเปลี่ยนเป็น Hired และย้ายไปแท็บ NewHires",
  TransferNoReq: "ตรวจข้อมูลโอนย้าย ถ้าต้องสร้างตำแหน่งให้เพิ่มในแท็บ Import_Requisition แล้วกดตรวจแล้ว",
  OfferAtClosedStore: "ตัดสินใจกับคนที่ Offer ไว้ (เช่น บันทึก Turndown ในหน้าติดตาม) แล้วกดตรวจแล้ว",
};

const CARD = "rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5";

function Summary({ s }: { s: RunSummary }) {
  const items: [string, number][] = [
    ["สร้างตำแหน่งใหม่", s.created],
    ["ปิดจากโอนย้าย", s.transferred],
    ["ยกเลิกจากร้านปิด", s.cancelled],
    ["เปลี่ยนเป็น Hired", s.hired],
    ["ต้องตรวจเพิ่ม", s.review],
    ["โอนย้ายรอถึงวันที่มีผล", s.waiting],
  ];
  return (
    <section aria-live="polite" className={cn(CARD, "space-y-4 p-5")}>
      <h2 className="font-heading font-medium">ผลการประมวลผลล่าสุด</h2>
      {s.closedMonth && <p className="text-sm text-muted-foreground">ปิดงวดเดือน {s.closedMonth} แล้ว ตัวเลขของเดือนนี้ใน Reports จะไม่เปลี่ยนอีก</p>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-muted px-4 py-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-heading text-2xl font-light tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {s.skipped.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-destructive">แถวที่ข้ามไป {s.skipped.length} แถว (แก้ใน Sheet แล้วกดประมวลผลใหม่)</h3>
          <ul className="divide-y divide-black/[0.06] rounded-2xl ring-1 ring-black/5">
            {s.skipped.map((x) => (
              <li key={`${x.tab}-${x.rowNumber}`} className="flex flex-wrap gap-x-3 px-4 py-2 text-sm">
                <span className="font-medium">
                  {x.tab} แถว {x.rowNumber}
                </span>
                <span className="text-muted-foreground">{x.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ReviewCard({ item, offers }: { item: ReviewView; offers: OfferOption[] }) {
  const uid = useId();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Offers at the same branch + position first; those are almost always the right one.
  const sorted = [...offers].sort((a, b) => Number(b.branchCode === item.branchCode && b.positionCode === item.positionCode) - Number(a.branchCode === item.branchCode && a.positionCode === item.positionCode));
  const sameCount = offers.filter((o) => o.branchCode === item.branchCode && o.positionCode === item.positionCode).length;
  const [offerId, setOfferId] = useState("");

  const act = (fn: () => Promise<{ ok: boolean; errors?: Record<string, string> }>, done: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.errors?.form ?? "ไม่สำเร็จ");
        return;
      }
      toast.success(done);
      router.refresh();
    });

  return (
    <li className={cn(CARD, "space-y-3 p-5")}>
      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", item.type === "UnmatchedHire" ? "bg-sky-100 text-sky-900" : "bg-amber-100 text-amber-900")}>
        {REVIEW_LABEL[item.type]}
      </span>
      <p className="text-sm">{item.detail}</p>
      <p className="text-xs text-muted-foreground">{REVIEW_HINT[item.type]}</p>
      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {item.type === "UnmatchedHire" ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (offerId) act(() => matchHire(item.id, offerId), "จับคู่แล้ว เปลี่ยนเป็น Hired");
          }}
        >
          <label htmlFor={`${uid}-offer`} className="sr-only">
            เลือกคน Offer
          </label>
          <Dropdown
            id={`${uid}-offer`}
            value={offerId}
            onChange={(v) => (setOfferId(v), setError(null))}
            placeholder={offers.length ? `เลือกคน Offer (${sameCount} คนที่สาขาและตำแหน่งตรงกัน)` : "ไม่มีคน Offer ที่รอเข้างาน"}
            options={sorted.map((o) => ({ value: o.id, label: `${o.branchCode === item.branchCode && o.positionCode === item.positionCode ? "★ " : ""}${o.label}` }))}
            searchable
            searchPlaceholder="ค้นหาชื่อ ตำแหน่ง หรือสาขา…"
            className="min-w-0 flex-1 basis-72"
          />
          <button type="submit" disabled={busy || !offerId} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-chip px-4 text-sm font-medium text-white disabled:opacity-50">
            <Link2 className="size-4" aria-hidden />
            {busy ? "กำลังจับคู่…" : "จับคู่"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => resolveReview(item.id), "ทำเครื่องหมายตรวจแล้ว")}
            className="h-10 rounded-full px-4 text-sm text-muted-foreground ring-1 ring-border hover:bg-muted disabled:opacity-50"
          >
            ไม่ต้องจับคู่
          </button>
        </form>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => act(() => resolveReview(item.id), "ทำเครื่องหมายตรวจแล้ว")}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-chip px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          <CheckCheck className="size-4" aria-hidden />
          {busy ? "กำลังบันทึก…" : "ตรวจแล้ว"}
        </button>
      )}
    </li>
  );
}

export function ProcessView({ pending, reviews, offers }: Props) {
  const router = useRouter();
  const [running, start] = useTransition();
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const waitingTotal = pending.reduce((s, p) => s + p.count, 0);

  return (
    <div className="space-y-4">
      <section className={cn(CARD, "flex flex-wrap items-center justify-between gap-4 p-5")}>
        <div className="space-y-2">
          <h2 className="font-heading font-medium">แถวที่ยังไม่ได้ประมวลผล</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {pending.map((p) => (
              <li key={p.tab} className={cn("rounded-full px-3 py-1", p.count ? "bg-ink-chip text-white" : "bg-muted text-muted-foreground")}>
                {p.label} <span className="font-heading tabular-nums">{p.count}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">โอนย้ายที่ยังไม่ถึงวันที่มีผลจะค้างอยู่ในรายการนี้จนถึงวัน</p>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await runProcessingNow();
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setSummary(res.summary);
              toast.success("ประมวลผลเสร็จแล้ว");
              router.refresh();
            })
          }
          className="inline-flex h-12 items-center gap-2 rounded-full bg-ink-chip px-6 text-sm font-medium text-white shadow-lg shadow-black/15 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {running ? <RefreshCw className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {running ? "กำลังประมวลผล…" : waitingTotal ? `ประมวลผลตอนนี้ (${waitingTotal} แถว)` : "ประมวลผลตอนนี้"}
        </button>
      </section>

      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {summary && <Summary s={summary} />}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-medium">
          รายการที่ต้องตรวจ <span className="font-sans text-sm font-normal text-muted-foreground">{reviews.length} รายการ</span>
        </h2>
        {reviews.length === 0 ? (
          <p className="rounded-3xl bg-muted/60 py-10 text-center text-sm text-muted-foreground">ไม่มีรายการที่ต้องตรวจ</p>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {reviews.map((r) => (
              <ReviewCard key={r.id} item={r} offers={offers} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
