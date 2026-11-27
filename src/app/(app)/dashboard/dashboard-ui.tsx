"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BAND_LABEL } from "@/components/aging-badge";
import type { RowStats } from "@/lib/domain/dashboard";
import { cn } from "@/lib/utils";
import { BANDS, BAND_DOT } from "./dashboard-tips";
import { TipRow, TipTitle, useTip } from "./hover-tip";

/** Liquid glass: translucent white, strong blur, bright rim and a soft inner highlight. */
export const GLASS =
  "bg-white/45 ring-1 ring-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(255,255,255,0.25),0_10px_40px_rgba(10,42,107,0.14)]";
export const CARD = cn("rounded-[1.75rem]", GLASS);

export function IconChip({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-chip text-white [&_svg]:size-4">
      {children}
    </span>
  );
}

/** Small tab group for use inside a glass card (the photo-banner version is GlassTabs). */
export function Pills<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.06] p-1 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            value === o.value ? "bg-white font-medium shadow-sm shadow-black/10" : "text-foreground/65 hover:bg-white/50",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="font-heading text-xs tabular-nums opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function CardHeader({ id, icon, title, aside }: { id: string; icon: ReactNode; title: string; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-4 pb-3">
      <h2 id={id} className="flex items-center gap-3 font-heading font-medium">
        <IconChip>{icon}</IconChip>
        {title}
      </h2>
      {aside}
    </header>
  );
}

/**
 * Spotlight. Put SPOT_GROUP on the container and SPOT on every item in it: the item under the pointer (or keyboard
 * focus) comes forward and the others fall back, so it is always clear which figure is being read.
 * Add SWELL for items that may grow, ROW for list rows that sit inside a clipped card.
 */
export const SPOT_GROUP = "group/spot";
export const SPOT =
  "relative select-none transition-[transform,scale,opacity,filter,box-shadow,background-color] duration-200 ease-out will-change-transform motion-reduce:transition-none " +
  "group-hover/spot:opacity-40 group-hover/spot:saturate-50 group-has-[:focus-visible]/spot:opacity-40 group-has-[:focus-visible]/spot:saturate-50 " +
  "hover:z-10 hover:opacity-100! hover:saturate-100! focus-visible:z-10 focus-visible:opacity-100! focus-visible:saturate-100! has-[:focus-visible]:z-10 has-[:focus-visible]:opacity-100! has-[:focus-visible]:saturate-100!";
/** Same spotlight for a group nested inside another one (a group name only matches its own level). */
export const SPOT_BAR_GROUP = "group/bar";
// Written out in full: Tailwind only generates classes it can read in the source.
export const SPOT_BAR =
  "relative select-none transition-[transform,scale,opacity,filter,box-shadow,background-color] duration-200 ease-out will-change-transform motion-reduce:transition-none " +
  "group-hover/bar:opacity-40 group-hover/bar:saturate-50 group-has-[:focus-visible]/bar:opacity-40 group-has-[:focus-visible]/bar:saturate-50 " +
  "hover:z-10 hover:opacity-100! hover:saturate-100! focus-visible:z-10 focus-visible:opacity-100! focus-visible:saturate-100! has-[:focus-visible]:z-10 has-[:focus-visible]:opacity-100! has-[:focus-visible]:saturate-100!";
export const SWELL =
  "hover:scale-[1.045] has-[:focus-visible]:scale-[1.045] hover:shadow-[0_16px_40px_rgba(10,42,107,0.28)] has-[:focus-visible]:shadow-[0_16px_40px_rgba(10,42,107,0.28)] motion-reduce:hover:scale-100";
export const ROW =
  "mx-2 rounded-2xl hover:scale-[1.018] focus-visible:scale-[1.018] hover:bg-white/90 focus-visible:bg-white/90 hover:shadow-[0_10px_28px_rgba(10,42,107,0.22)] hover:ring-1 hover:ring-white motion-reduce:hover:scale-100";

/** Bright yellow so Offers stand out from the green → red aging bands (and from the navy of ปิดสำเร็จ). */
export const OFFER_COLOR = "#facc15";

/** Share of a total as a percentage: one decimal below 10% so a small share never reads as 0%. */
export function pctText(n: number, total: number): string {
  if (n <= 0 || total <= 0) return "0%";
  const p = (n / total) * 100;
  return p < 10 ? `${Number(p.toFixed(1))}%` : `${Math.round(p)}%`;
}

/**
 * Stacked bar for a slice of rows: Offer first from the left, then one segment per aging band. Its length is
 * open / max, so rows compare by length and read by colour; with `full` every bar spans the whole track (100% of
 * that row), so the Offer share reads as progress. Segments swell on hover and explain themselves in a tooltip.
 */
export function StackBar({ s, max, full, className }: { s: RowStats; max: number; full?: boolean; className?: string }) {
  const { bind } = useTip();
  const segs = [
    { key: "offer", n: s.offers, color: OFFER_COLOR, label: "Offer แล้ว", note: "รอเข้างาน" },
    ...BANDS.map((b) => ({ key: b as string, n: s.bands[b], color: BAND_DOT[b], label: `ว่างค้าง ${BAND_LABEL[b]}`, note: "ยังไม่มี Offer" })),
  ].filter((x) => x.n > 0);
  return (
    <span
      role="img"
      aria-label={`เปิดสรรหา ${s.open} ตำแหน่ง: ${segs.map((x) => `${x.label} ${x.n}`).join(", ")}`}
      className={cn("group/seg flex h-2.5 items-center rounded-full bg-black/[0.06]", className)}
    >
      <span className="flex h-full gap-px" style={{ width: full ? "100%" : `${Math.max(4, (s.open / Math.max(1, max)) * 100)}%` }}>
        {segs.map((x) => (
          <span
            key={x.key}
            // Basis 0 so each segment's share is exactly n / open, and a change in share glides instead of jumping.
            style={{ flexGrow: x.n, flexBasis: 0, background: x.color }}
            className="min-w-1 origin-center rounded-[3px] [transition:flex-grow_600ms_ease-out,transform_150ms,scale_150ms,opacity_150ms] first:rounded-l-full last:rounded-r-full group-hover/seg:opacity-35 hover:scale-y-[2.1] hover:opacity-100! motion-reduce:transition-none"
            {...bind(
              <>
                <TipTitle sub={x.note}>{x.label}</TipTitle>
                <TipRow dot={x.color} label="ตำแหน่ง" value={x.n} />
                <TipRow label="จากทั้งหมดในแถวนี้" value={pctText(x.n, s.open)} />
              </>,
            )}
          />
        ))}
      </span>
    </span>
  );
}

/**
 * Grows and shrinks to fit its content instead of jumping: the box animates to the measured height of what is inside.
 * If you give it vertical padding (to keep shadows and Thai tone marks from being clipped), pass the padding of one side
 * in px as `pad`: the box is border-box, so its height must include both sides.
 */
export function SmoothHeight({ children, className, pad = 0 }: { children: ReactNode; className?: string; pad?: number }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    // Round up: offsetHeight rounds down and would shave the last sub-pixel row off Thai tone marks and descenders.
    const measure = () => setH(Math.ceil(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={cn("transition-[height] duration-300 ease-out motion-reduce:transition-none", className)} style={h === null ? undefined : { height: h + pad * 2 }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

/**
 * Returns `settle(apply, clearing)`: runs `apply` now, or after a short pause when it is the "pointer left" kind.
 * A new call cancels a pending one, so moving from one item to the next never flashes the overview in between.
 */
export function useSettle(delay = 140) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return useCallback(
    (apply: () => void, clearing: boolean) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (clearing) timer.current = setTimeout(apply, delay);
      else apply();
    },
    [delay],
  );
}
