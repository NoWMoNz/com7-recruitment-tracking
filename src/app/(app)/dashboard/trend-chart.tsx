"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { countAxis, monotonePath, monotoneY } from "@/lib/chart/curve";
import { sumTrend, type TrendMonth, type TrendPoint } from "@/lib/domain/dashboard";
import type { PeopleFilter } from "@/lib/domain/people";
import { cn } from "@/lib/utils";
import type { NoteFn } from "./dashboard-tips";
import { CARD } from "./dashboard-ui";

const SERIES = [
  { key: "new", label: "แจ้งสรรหาใหม่", color: "#e4572e" },
  { key: "offers", label: "Offer", color: "#1f9d55" },
  { key: "closed", label: "ปิดสำเร็จ", color: "#0d3d8f" },
  { key: "cancel", label: "Cancel", color: "#8c8c82" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

const RANGES = [3, 6, 12] as const;
const MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTH_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

const short = (m: string) => MONTH_SHORT[Number(m.slice(5)) - 1] ?? m;
const full = (m: string) => `${MONTH_FULL[Number(m.slice(5)) - 1] ?? m} ${m.slice(0, 4)}`;

const H = 232;
const PAD = { l: 14, r: 34, t: 18, b: 38 };

/** Width of the element, kept up to date as it resizes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function change(v: number, prev: number | undefined) {
  if (prev === undefined) return null;
  const d = v - prev;
  return d === 0 ? "เท่าเดิม" : `${d > 0 ? "+" : "−"}${Math.abs(d)}`;
}

/**
 * Monthly trend as smooth lines. Point the chart at a month to see every figure for it; hover a legend item to follow
 * one line, click it to hide or show it. The last stretch is dashed because the current month is not over yet.
 */
export function TrendChart({ trend, region, bu = "", people = {}, onNote }: { trend: TrendMonth[]; region: string; bu?: string; people?: PeopleFilter; onNote?: NoteFn }) {
  const uid = useId().replace(/:/g, "");
  const [box, width] = useWidth();
  const [range, setRange] = useState<(typeof RANGES)[number]>(6);
  const [hidden, setHidden] = useState<ReadonlySet<SeriesKey>>(new Set());
  const [follow, setFollow] = useState<SeriesKey | null>(null);
  // Where the pointer is on the chart, in px. The marker follows it freely; `at` is the month it is closest to.
  const [cursor, setCursor] = useState<number | null>(null);

  const points: TrendPoint[] = useMemo(() => sumTrend(trend, { region, bu, ...people }).slice(-range), [trend, region, bu, people, range]);
  const shown = SERIES.filter((s) => !hidden.has(s.key));
  const n = points.length;
  const { top, ticks } = useMemo(() => countAxis(Math.max(0, ...points.flatMap((p) => shown.map((s) => p[s.key])))), [points, shown]);

  // Room on the right for the axis numbers, which get wider as the counts do (1000 needs more than 10).
  const pad = { ...PAD, r: 22 + String(top).length * 7 };
  const plotW = Math.max(0, width - pad.l - pad.r);
  const plotH = H - pad.t - pad.b;
  const xOf = (i: number) => pad.l + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const yOf = (v: number) => pad.t + plotH * (1 - v / top);
  const labelEvery = n > 1 && plotW / (n - 1) < 44 ? 2 : 1;
  const empty = shown.every((s) => points.every((p) => p[s.key] === 0));

  const toggle = (k: SeriesKey) =>
    setHidden((h) => {
      const next = new Set(h);
      if (!next.delete(k)) {
        // Keep at least one line on the chart.
        if (next.size === SERIES.length - 1) return h;
        next.add(k);
      }
      return next;
    });

  const idxAt = (x: number) => (n <= 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round(((x - pad.l) / plotW) * (n - 1)))));
  const at = cursor === null || n === 0 ? null : idxAt(cursor);
  const pointerX = (e: PointerEvent<SVGSVGElement>) => (plotW === 0 ? null : Math.min(pad.l + plotW, Math.max(pad.l, e.clientX - e.currentTarget.getBoundingClientRect().left)));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setCursor((c) => xOf(Math.min(n - 1, Math.max(0, (c === null ? n - 1 : idxAt(c)) + (e.key === "ArrowLeft" ? -1 : 1)))));
    } else if (e.key === "Escape") setCursor(null);
  };

  // Tell the summary card which month is being read (only when it changes, so a new range never clears someone else's hover).
  const told = useRef<number | null>(null);
  useEffect(() => {
    if (!onNote || told.current === at) return;
    told.current = at;
    const p = at !== null ? points[at] : undefined;
    onNote(
      p
        ? {
            label: full(p.month),
            text: `แจ้งสรรหาใหม่ ${p.new} · Offer ${p.offers} · ปิดสำเร็จ ${p.closed}`,
            sub: `Cancel ${p.cancel} · เริ่มพัก ${p.hold}${at === points.length - 1 ? " · เดือนนี้นับถึงวันนี้" : ""}`,
          }
        : null,
    );
  }, [at, points, onNote]);

  const cur = at !== null ? points[at] : undefined;
  const prev = at !== null && at > 0 ? points[at - 1] : undefined;
  const tipX = cursor ?? 0;
  const tipLeft = tipX > width / 2;
  // The last point is the month in progress.
  const split = n >= 2 ? xOf(n - 2) : 0;

  return (
    <section aria-labelledby="trk-trend-title" className={cn(CARD, "p-4 sm:p-5")}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <h2 id="trk-trend-title" className="font-heading text-lg font-medium">
            แนวโน้มการสรรหา
          </h2>
          <p className="text-xs text-muted-foreground">{[region || "ทุกภาค", bu].filter(Boolean).join(" · ")} · รายเดือน</p>
        </div>
        <div role="group" aria-label="ช่วงเวลา" className="inline-flex gap-1 rounded-full bg-muted p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => {
                setRange(r);
                setCursor(null);
              }}
              className={cn(
                "rounded-full px-3.5 py-1 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                range === r ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r} เดือน
            </button>
          ))}
        </div>
      </header>

      <ul className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1" aria-label="เส้นในกราฟ กดเพื่อซ่อนหรือแสดง">
        {SERIES.map((s) => {
          const off = hidden.has(s.key);
          return (
            <li key={s.key}>
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => toggle(s.key)}
                onPointerEnter={() => setFollow(s.key)}
                onPointerLeave={() => setFollow(null)}
                onFocus={() => setFollow(s.key)}
                onBlur={() => setFollow(null)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-full px-2.5 text-sm transition-[background-color,opacity] outline-none hover:bg-black/[0.05] focus-visible:ring-3 focus-visible:ring-ring/50",
                  off && "opacity-45",
                )}
              >
                <span
                  aria-hidden
                  className="size-3 rounded-full border-2 bg-white"
                  style={{ borderColor: s.color, background: off ? "#fff" : s.color, boxShadow: off ? undefined : "inset 0 0 0 2px #fff" }}
                />
                <span className={off ? "line-through" : undefined}>{s.label}</span>
              </button>
            </li>
          );
        })}
        <li className="ml-auto hidden text-xs text-muted-foreground sm:block">เส้นประ = เดือนนี้ (นับถึงวันนี้)</li>
      </ul>

      <div ref={box} className="relative mt-1">
        {width > 0 && n > 0 && (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`กราฟเส้นรายเดือน ${n} เดือนล่าสุด ใช้ลูกศรซ้ายขวาเพื่อดูแต่ละเดือน`}
            tabIndex={0}
            onKeyDown={onKey}
            onFocus={() => setCursor((c) => c ?? xOf(n - 1))}
            onBlur={() => setCursor(null)}
            onPointerDown={(e) => setCursor(pointerX(e))}
            onPointerMove={(e) => setCursor(pointerX(e))}
            onPointerLeave={() => setCursor(null)}
            className="block touch-pan-y rounded-xl outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <defs>
              <clipPath id={`${uid}-solid`}>
                <rect x={0} y={0} width={Math.max(0, split)} height={H} />
              </clipPath>
              <clipPath id={`${uid}-live`}>
                <rect x={split} y={0} width={Math.max(0, width - split)} height={H} />
              </clipPath>
            </defs>

            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={width - pad.r + 6} y1={yOf(t)} y2={yOf(t)} stroke="rgba(0,0,0,0.08)" strokeDasharray={t === 0 ? undefined : "3 5"} />
                <text x={width - pad.r + 12} y={yOf(t) + 3.5} fontSize={11} fill="currentColor" opacity={0.5}>
                  {t}
                </text>
              </g>
            ))}

            {points.map((p, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text key={p.month} x={xOf(i)} y={H - 11} textAnchor="middle" fontSize={11} fill="currentColor" opacity={at === i ? 0 : i === n - 1 ? 0.85 : 0.5} fontWeight={i === n - 1 ? 600 : 400}>
                  {short(p.month)}
                </text>
              ) : null,
            )}

            {at !== null && cursor !== null && (
              <>
                <line x1={cursor} x2={cursor} y1={pad.t - 6} y2={H - pad.b + 6} stroke="rgba(0,0,0,0.3)" strokeDasharray="3 4" />
                <rect x={cursor - 21} y={H - 27} width={42} height={20} rx={10} className="fill-ink-chip" />
                <text x={cursor} y={H - 13} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
                  {short(points[at].month)}
                </text>
              </>
            )}

            {shown.map((s) => {
              const pts = points.map((p, i) => ({ x: xOf(i), y: yOf(p[s.key]) }));
              const d = monotonePath(pts);
              const dim = follow !== null && follow !== s.key;
              const strong = follow === s.key;
              const common = { d, fill: "none", stroke: s.color, strokeWidth: strong ? 3.4 : 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
              return (
                <g key={s.key} style={{ opacity: dim ? 0.18 : 1, transition: "opacity 160ms" }}>
                  {n >= 2 ? (
                    <>
                      <path {...common} clipPath={`url(#${uid}-solid)`} />
                      <path {...common} clipPath={`url(#${uid}-live)`} strokeDasharray="1 6" />
                    </>
                  ) : null}
                  {/* The month in progress is always marked; the pointer's marker rides along the curve. */}
                  {n > 0 && <circle cx={pts[n - 1].x} cy={pts[n - 1].y} r={4.5} fill="#fff" stroke={s.color} strokeWidth={2.4} />}
                  {cursor !== null && <circle cx={cursor} cy={monotoneY(pts, cursor)} r={5.5} fill="#fff" stroke={s.color} strokeWidth={3} />}
                </g>
              );
            })}
          </svg>
        )}

        {empty && width > 0 && <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลในช่วงนี้</p>}

        {cur && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 w-max min-w-40 rounded-2xl bg-white/80 py-2.5 pr-4 pl-3.5 text-xs shadow-[0_12px_36px_rgba(10,42,107,0.2)] ring-1 ring-black/5 backdrop-blur-xl"
            style={{ left: tipX, transform: `translateX(${tipLeft ? "calc(-100% - 14px)" : "14px"})` }}
          >
            <div className="mb-1.5 text-sm font-medium">{full(cur.month)}</div>
            {shown.map((s) => {
              const delta = change(cur[s.key], prev?.[s.key]);
              return (
                <div key={s.key} className="flex items-center gap-2 py-px">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="text-foreground/70">{s.label}</span>
                  <span className="ml-auto pl-4 font-medium tabular-nums">{cur[s.key]}</span>
                  <span className="w-12 text-right text-foreground/50 tabular-nums">{delta ?? ""}</span>
                </div>
              );
            })}
            {at === n - 1 && <div className="mt-1.5 border-t border-black/[0.08] pt-1.5 text-foreground/60">เดือนนี้ นับถึงวันนี้</div>}
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>แนวโน้มการสรรหารายเดือน</caption>
        <thead>
          <tr>
            <th>เดือน</th>
            {SERIES.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.month}>
              <th>{full(p.month)}</th>
              {SERIES.map((s) => (
                <td key={s.key}>{p[s.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
