"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlarmClock, ArrowUpRight, Hourglass, Layers, PauseCircle, ShieldCheck, ThumbsDown, TrendingUp, UserMinus, UserPlus } from "lucide-react";
import { TatBadge } from "@/components/aging-badge";
import { NEAR_SLA_RATIO, OFFER_STALE_DAYS, groupOpen, type TrendPoint } from "@/lib/domain/dashboard";
import { formatThaiDate } from "@/lib/domain/dates";
import { OFFER_LOOKBACK_DAYS, RESIGN_LOOKAHEAD_DAYS, summarizeDeclines, summarizeResignations, type ManpowerGap, type OfferOutcome, type UpcomingResign } from "@/lib/domain/outlook";
import type { TrackingRow } from "@/lib/domain/tracking";
import { cn } from "@/lib/utils";
import { ListTip, RowTip, StatsTip, trackingHref, type NoteFn, type SpotFn } from "./dashboard-tips";
import { CardHeader, GLASS, IconChip, Pills, ROW, SPOT, SPOT_GROUP, StackBar, SWELL } from "./dashboard-ui";
import { TipNote, TipRow, TipTitle, useTip } from "./hover-tip";

const NEAR_SLA_PCT = Math.round(NEAR_SLA_RATIO * 100);

/* ---------- Action tiles ---------- */

export interface ApprovalItem {
  id: string;
  type: "Cancel" | "Hold";
  region: string;
  province: string;
  bu: string;
  branchName: string;
  positionName: string;
  by: string;
  since: string;
}

export interface HoldItem {
  id: string;
  region: string;
  province: string;
  bu: string;
  branchName: string;
  positionName: string;
  taName: string;
  days: number;
}

function Tile({
  icon,
  value,
  unit,
  label,
  note,
  href,
  onClick,
  tip,
  onSpot,
}: {
  icon: ReactNode;
  value: number | string;
  /** Small suffix after the value, e.g. "%". */
  unit?: string;
  label: string;
  note: string;
  href?: string;
  onClick?: () => void;
  tip: ReactNode;
  /** Hover/focus hook for the spotlight and the summary card. */
  onSpot?: (on: boolean) => void;
}) {
  const { bind } = useTip();
  const body = (
    <>
      <IconChip>{icon}</IconChip>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="font-heading text-[2rem] leading-none font-light tabular-nums">
            {value}
            {unit && <span className="ml-0.5 text-sm">{unit}</span>}
          </span>
          <span className="text-sm font-medium">{label}</span>
        </span>
        <span className="mt-1 block text-xs leading-snug text-foreground/65">{note}</span>
      </span>
      {(href || onClick) && <ArrowUpRight aria-hidden className="size-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />}
    </>
  );
  const cls = cn(
    SPOT,
    SWELL,
    GLASS,
    "group flex h-full w-full items-center gap-3 rounded-[1.5rem] p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
  );
  const hover = bind(tip, { onSpot });
  if (href) return <Link href={href} className={cls} {...hover}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls} {...hover}>{body}</button>;
  return <div tabIndex={0} className={cls} {...hover}>{body}</div>;
}

export function ActionTiles({
  approvals,
  holds,
  near,
  isAdmin,
  onShowNearSla,
  onSpot,
  onNote,
}: {
  approvals: ApprovalItem[];
  holds: HoldItem[];
  near: TrackingRow[];
  isAdmin: boolean;
  onShowNearSla: () => void;
  onSpot: SpotFn;
  onNote: NoteFn;
}) {
  const cancels = approvals.filter((a) => a.type === "Cancel").length;
  const holdReqs = approvals.length - cancels;
  const oldestHold = Math.max(0, ...holds.map((h) => h.days));
  const nearCount = near.length;
  const oldestApproval = approvals.reduce<string | null>((o, a) => (!o || a.since < o ? a.since : o), null);
  const nearIds = new Set(near.map((r) => r.id));
  const longHolds = [...holds].sort((a, b) => b.days - a.days);
  return (
    <ul aria-label="งานที่ต้องจัดการ" className={cn(SPOT_GROUP, "grid gap-4 md:grid-cols-3")}>
      <li>
        <Tile
          icon={<ShieldCheck />}
          value={approvals.length}
          label="รออนุมัติ"
          note={approvals.length ? `Cancel ${cancels} · Hold ${holdReqs}${isAdmin ? "" : " · รอผู้ดูแลระบบตัดสิน"}` : "ไม่มีคำขอค้าง"}
          href={isAdmin ? "/approvals" : undefined}
          onSpot={(on) =>
            onNote(
              on
                ? {
                    label: "รออนุมัติ",
                    text: approvals.length ? `มีคำขอรอตัดสิน ${approvals.length} รายการ` : "ไม่มีคำขอค้าง",
                    sub: approvals.length ? `ยกเลิก ${cancels} · พัก ${holdReqs} · เก่าสุดตั้งแต่ ${formatThaiDate(oldestApproval)}` : undefined,
                    provinces: approvals.map((a) => a.province).filter(Boolean),
                  }
                : null,
            )
          }
          tip={
            <ListTip
              title={isAdmin ? "คำขอที่รอตัดสิน (เก่าสุดก่อน)" : "คำขอที่รอผู้ดูแลระบบตัดสิน"}
              total={approvals.length}
              empty="ไม่มีคำขอค้าง"
              items={approvals.slice(0, 5).map((a) => ({ label: `${a.type === "Cancel" ? "ยกเลิก" : "พัก"} · ${a.positionName} · ${a.branchName}`, value: `${a.by} · ${formatThaiDate(a.since)}` }))}
            />
          }
        />
      </li>
      <li>
        <Tile
          icon={<PauseCircle />}
          value={holds.length}
          label="พักอยู่ (Hold)"
          note={holds.length ? `นานสุด ${oldestHold} วัน` : "ไม่มีตำแหน่งที่พัก"}
          href="/hold"
          onSpot={(on) =>
            onNote(
              on
                ? {
                    label: "พักอยู่ (Hold)",
                    text: holds.length ? `มี ${holds.length} ตำแหน่งที่พักอยู่` : "ไม่มีตำแหน่งที่พัก",
                    sub: holds.length ? `นานสุด ${oldestHold} วัน · เฉลี่ย ${Math.round(holds.reduce((n, h) => n + h.days, 0) / holds.length)} วัน` : undefined,
                    provinces: holds.map((h) => h.province).filter(Boolean),
                  }
                : null,
            )
          }
          tip={<ListTip title="พักนานสุด" total={holds.length} empty="ไม่มีตำแหน่งที่พัก" items={longHolds.slice(0, 5).map((h) => ({ label: `${h.positionName} · ${h.branchName}`, value: `${h.days} วัน` }))} />}
        />
      </li>
      <li>
        <Tile
          icon={<AlarmClock />}
          value={nearCount}
          label="ใกล้เกิน SLA"
          note={`ใช้เวลาเกิน ${NEAR_SLA_PCT}% ของ SLA`}
          onClick={nearCount > 0 ? onShowNearSla : undefined}
          onSpot={(on) => onSpot(on ? (r) => nearIds.has(r.id) : null, on ? "ใกล้เกิน SLA" : undefined)}
          tip={
            <ListTip
              title={`ใกล้ถึง SLA (ใช้เวลาเกิน ${NEAR_SLA_PCT}%)`}
              total={nearCount}
              empty="ไม่มีตำแหน่งที่ใกล้ถึง SLA"
              items={near.slice(0, 5).map((r) => ({ label: `${r.positionName} · ${r.branchName}`, value: r.slaDays - r.tat === 0 ? "วันนี้" : `อีก ${r.slaDays - r.tat} วัน` }))}
            />
          }
        />
      </li>
    </ul>
  );
}

/* ---------- Outlook: what is coming and what is slipping ---------- */

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Three tiles that look past the open vacancies: resignations due, headcount nobody is recruiting for, Offers turned down. */
export function OutlookTiles({
  resigns,
  gaps,
  hasQuota,
  outcomes,
  today,
  onNote,
}: {
  resigns: UpcomingResign[];
  gaps: ManpowerGap[];
  hasQuota: boolean;
  outcomes: OfferOutcome[];
  today: string;
  onNote: NoteFn;
}) {
  const { soon, later } = summarizeResignations(resigns, today);
  const gapTotal = gaps.reduce((n, g) => n + g.gap, 0);
  const shortTotal = gaps.reduce((n, g) => n + g.short, 0);
  const dec = summarizeDeclines(outcomes);
  const top = dec.reasons[0];
  return (
    <ul aria-label="ภาพรวมที่กำลังจะเกิดขึ้น" className={cn(SPOT_GROUP, "grid gap-4 md:grid-cols-3")}>
      <li>
        <Tile
          icon={<UserMinus />}
          value={soon.length}
          label={`ลาออกใน ${RESIGN_LOOKAHEAD_DAYS} วัน`}
          note={soon.length ? `ใกล้สุด ${formatThaiDate(soon[0].effectiveDate)}${later ? ` · หลังจากนั้นอีก ${later}` : ""}` : later ? `ยังไม่มี · หลังจากนั้นอีก ${later}` : "ไม่มีคนลาออกที่รอมีผล"}
          href="/resignations"
          onSpot={(on) =>
            onNote(
              on
                ? {
                    label: "ลาออกที่กำลังจะมีผล",
                    text: soon.length ? `จะมีตำแหน่งว่างเพิ่มอีก ${soon.length} ตำแหน่งใน ${RESIGN_LOOKAHEAD_DAYS} วัน` : `ไม่มีใครลาออกใน ${RESIGN_LOOKAHEAD_DAYS} วันข้างหน้า`,
                    sub: later ? `หลังจากนั้นอีก ${later} ราย` : undefined,
                    provinces: soon.map((r) => r.province).filter(Boolean),
                  }
                : null,
            )
          }
          tip={
            <ListTip
              title="ลาออกที่จะมีผลเร็วที่สุด"
              total={soon.length}
              empty={`ไม่มีใครลาออกใน ${RESIGN_LOOKAHEAD_DAYS} วัน`}
              items={soon.slice(0, 5).map((r) => ({ label: `${r.positionName} · ${r.branchName}`, value: formatThaiDate(r.effectiveDate) }))}
            />
          }
        />
      </li>
      <li>
        <Tile
          icon={<UserPlus />}
          value={gapTotal}
          label="ขาดแต่ยังไม่เปิดสรรหา"
          note={gaps.length ? `ใน ${gaps.length} สาขา · HR ขาดรวม ${shortTotal}` : hasQuota ? "ทุกสาขาเปิดสรรหาครบตามที่ขาด" : "ยังไม่มีข้อมูลโควตาจาก HR"}
          href="/manpower"
          onSpot={(on) =>
            onNote(
              on
                ? {
                    label: "ขาดแต่ยังไม่เปิดสรรหา",
                    text: gapTotal ? `HR แจ้งว่าขาดคน แต่ยังไม่มีตำแหน่งเปิดรองรับอีก ${gapTotal} ตำแหน่ง` : "ทุกตำแหน่งที่ขาดมีการเปิดสรรหาแล้ว",
                    sub: gaps.length ? `${gaps.length} สาขา · ตำแหน่งเหล่านี้ยังไม่อยู่ในการติดตาม` : undefined,
                    provinces: gaps.map((g) => g.province).filter(Boolean),
                  }
                : null,
            )
          }
          tip={
            <ListTip
              title="สาขาที่ขาดโดยไม่มีตำแหน่งเปิดรองรับ"
              total={gaps.length}
              empty={hasQuota ? "ไม่มีสาขาที่หลุดการติดตาม" : "ยังไม่มีข้อมูลโควตา"}
              items={gaps.slice(0, 5).map((g) => ({ label: g.branchName, value: `${g.gap} ตำแหน่ง` }))}
            />
          }
        />
      </li>
      <li>
        <Tile
          icon={<ThumbsDown />}
          value={dec.pct ?? "–"}
          unit={dec.pct === null ? undefined : "%"}
          label="ปฏิเสธ Offer"
          note={dec.total ? `${dec.declined} จาก ${dec.total} Offer ใน ${OFFER_LOOKBACK_DAYS} วัน${top ? ` · มากสุด: ${clip(top.reason, 22)}` : ""}` : `ไม่มี Offer ใน ${OFFER_LOOKBACK_DAYS} วัน`}
          onSpot={(on) =>
            onNote(
              on
                ? {
                    label: "ปฏิเสธ Offer",
                    text: dec.total ? `ผู้สมัครปฏิเสธ ${dec.declined} จาก ${dec.total} Offer ใน ${OFFER_LOOKBACK_DAYS} วันที่ผ่านมา` : `ไม่มี Offer ใน ${OFFER_LOOKBACK_DAYS} วันที่ผ่านมา`,
                    sub: top ? `เหตุผลที่พบมากสุด: ${top.reason} (${top.count})` : undefined,
                    provinces: outcomes.filter((o) => o.declinedReason !== null).map((o) => o.province).filter(Boolean),
                  }
                : null,
            )
          }
          tip={
            <ListTip
              title={`เหตุผลที่ปฏิเสธ Offer (${OFFER_LOOKBACK_DAYS} วัน)`}
              total={dec.reasons.length}
              empty="ไม่มี Offer ที่ถูกปฏิเสธ"
              items={dec.reasons.slice(0, 5).map((r) => ({ label: clip(r.reason, 30), value: `${r.count} ราย` }))}
            />
          }
        />
      </li>
    </ul>
  );
}

/* ---------- Trend ---------- */

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const SERIES = [
  { key: "offers", label: "Offer", color: "#1f9d55" },
  { key: "closed", label: "ปิดสำเร็จ", color: "#0d3d8f" },
  { key: "cancel", label: "Cancel", color: "#b8b8ae" },
] as const;

function monthLabel(m: string) {
  return MONTHS[Number(m.slice(5)) - 1] ?? m;
}

const MONTH_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function signed(n: number) {
  return n === 0 ? "เท่าเดิม" : `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
}

type SeriesKey = (typeof SERIES)[number]["key"];

export function TrendCard({ points, scopeNote, onNote }: { points: TrendPoint[]; scopeNote: string; onNote: NoteFn }) {
  const { bind } = useTip();
  // i = month column under the pointer (-1 when only a legend item is), key = the series being followed.
  const [active, setActive] = useState<{ i: number; key: SeriesKey | null } | null>(null);
  const W = 360;
  const H = 210;
  const top = 18;
  const bottom = 26;
  const barW = 14;
  const gap = 3;
  const max = Math.max(1, ...points.flatMap((p) => SERIES.map((s) => p[s.key])));
  const slot = W / Math.max(1, points.length);
  const cur = points.at(-1);
  const prev = points.at(-2);
  const delta = cur && prev ? cur.offers - prev.offers : 0;
  const groupW = SERIES.length * barW + (SERIES.length - 1) * gap;
  // A bar is lit when nothing is active, when its series is being followed, or when its month is the one hovered.
  const lit = (i: number, key: SeriesKey) => !active || (active.key ? key === active.key : i === active.i);

  return (
    <section aria-labelledby="trend-title" className={cn("rounded-3xl", GLASS)}>
      <CardHeader
        id="trend-title"
        icon={<TrendingUp />}
        title="แนวโน้ม 6 เดือน"
        aside={
          cur && prev ? (
            <span className={cn("rounded-full px-3 py-1 text-xs", delta > 0 ? "bg-[#1f9d55]/15 text-[#176b3c]" : delta < 0 ? "bg-red-100 text-[#b91c1c]" : "bg-black/5 text-foreground/65")}>
              Offer {delta === 0 ? "เท่าเดือนก่อน" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} จากเดือนก่อน`}
            </span>
          ) : null
        }
      />
      <div className="px-5 pb-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full overflow-visible"
          role="group"
          aria-label={`แนวโน้มรายเดือน ${points.map((p) => `${monthLabel(p.month)} Offer ${p.offers} ปิดสำเร็จ ${p.closed} Cancel ${p.cancel}`).join(", ")}`}
        >
          <line x1={0} x2={W} y1={H - bottom} y2={H - bottom} stroke="rgba(0,0,0,0.12)" />
          {points.map((p, i) => {
            const x0 = i * slot + (slot - groupW) / 2;
            const isCurrent = i === points.length - 1;
            const isActive = active?.i === i;
            const before = points[i - 1];
            const val = (v: number, prevV: number | undefined) => (prevV === undefined ? v : `${v} (${signed(v - prevV)})`);
            const tip = (
              <>
                <TipTitle sub={isCurrent ? "เดือนนี้ นับถึงวันนี้" : before ? "เทียบกับเดือนก่อนหน้า" : undefined}>
                  {MONTH_FULL[Number(p.month.slice(5)) - 1]} {p.month.slice(0, 4)}
                </TipTitle>
                <TipRow dot="#7a8794" label="แจ้งสรรหาใหม่" value={val(p.new, before?.new)} />
                {SERIES.map((s) => (
                  <TipRow key={s.key} dot={s.color} label={s.label} value={val(p[s.key], before?.[s.key])} hl={isActive && active?.key === s.key} />
                ))}
                <TipRow dot="#d49b1f" label="เริ่มพัก (Hold)" value={val(p.hold, before?.hold)} />
                <TipNote>ปิดสำเร็จ = เข้างานหรือรับโอน</TipNote>
              </>
            );
            return (
              <g
                key={p.month}
                {...bind(tip, {
                  onSpot: (on) => {
                    if (!on) setActive(null);
                    onNote(
                      on
                        ? {
                            label: `${MONTH_FULL[Number(p.month.slice(5)) - 1]} ${p.month.slice(0, 4)}`,
                            text: `แจ้งสรรหาใหม่ ${p.new} · Offer ${p.offers} · ปิดสำเร็จ ${p.closed}`,
                            sub: `Cancel ${p.cancel} · เริ่มพัก ${p.hold}${isCurrent ? " · เดือนนี้นับถึงวันนี้" : ""}`,
                          }
                        : null,
                    );
                  },
                })}
                tabIndex={0}
                onFocus={() => setActive({ i, key: null })}
                aria-label={`${monthLabel(p.month)} Offer ${p.offers} ปิดสำเร็จ ${p.closed} Cancel ${p.cancel}`}
                className="cursor-default outline-none"
              >
                <rect
                  x={i * slot + 3}
                  y={4}
                  width={slot - 6}
                  height={H - 4}
                  rx={12}
                  fill={isActive ? "rgba(255,255,255,0.9)" : isCurrent ? "rgba(255,255,255,0.5)" : "transparent"}
                  style={{ transition: "fill 180ms", filter: isActive ? "drop-shadow(0 6px 10px rgba(10,42,107,0.18))" : undefined }}
                  onPointerEnter={() => setActive({ i, key: null })}
                />
                {SERIES.map((s, j) => {
                  const v = p[s.key];
                  const h = v === 0 ? 0 : Math.max(3, (v / max) * (H - top - bottom));
                  const x = x0 + j * (barW + gap);
                  const on = lit(i, s.key);
                  const picked = isActive && active?.key === s.key;
                  return (
                    <g key={s.key} onPointerEnter={() => setActive({ i, key: s.key })}>
                      <rect
                        x={x}
                        y={H - bottom - h}
                        width={barW}
                        height={h}
                        rx={4}
                        fill={s.color}
                        style={{
                          transformBox: "fill-box",
                          transformOrigin: "center bottom",
                          transform: picked ? "scale(1.45, 1.05)" : isActive ? "scale(1.12, 1.02)" : "none",
                          opacity: on ? 1 : 0.2,
                          transition: "transform 180ms ease-out, opacity 180ms",
                        }}
                      />
                      {v > 0 && (
                        <text
                          x={x + barW / 2}
                          y={H - bottom - h - (picked ? 6 : 3)}
                          textAnchor="middle"
                          fontSize={picked ? 12 : 9}
                          fontWeight={picked ? 700 : 400}
                          fill="currentColor"
                          style={{ opacity: on ? (picked || !active ? 0.85 : 0.7) : 0.15, transition: "opacity 180ms" }}
                        >
                          {v}
                        </text>
                      )}
                    </g>
                  );
                })}
                {isActive && <rect x={i * slot + slot / 2 - 17} y={H - 21} width={34} height={17} rx={8.5} fill="#0a2a6b" />}
                <text
                  x={i * slot + slot / 2}
                  y={H - 9}
                  textAnchor="middle"
                  fontSize={10}
                  fill={isActive ? "#fff" : "currentColor"}
                  opacity={isActive || isCurrent ? 1 : 0.6}
                  fontWeight={isActive || isCurrent ? 600 : 400}
                >
                  {monthLabel(p.month)}
                </text>
              </g>
            );
          })}
        </svg>
        <ul className="flex flex-wrap items-center gap-x-1 gap-y-1 pt-2 text-xs text-foreground/75">
          {SERIES.map((s) => {
            const on = active?.key === s.key;
            return (
              <li
                key={s.key}
                tabIndex={0}
                onPointerEnter={() => setActive({ i: -1, key: s.key })}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive({ i: -1, key: s.key })}
                onBlur={() => setActive(null)}
                className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50", on ? "bg-white shadow-sm shadow-black/10" : "hover:bg-white/60")}
              >
                <span aria-hidden className={cn("size-2.5 rounded-full transition-transform", on && "scale-150")} style={{ background: s.color }} />
                {s.label}
                <span className="font-heading font-medium tabular-nums">{cur?.[s.key] ?? 0}</span>
              </li>
            );
          })}
          <li className="ml-auto text-foreground/55">เดือนนี้</li>
        </ul>
        <p className="pt-1.5 text-xs text-foreground/55">{scopeNote} · ชี้แท่งหรือชื่อชุดข้อมูลเพื่อดูเฉพาะชุดนั้น</p>
      </div>
    </section>
  );
}

/* ---------- Attention list ---------- */

export type AttentionTab = "longest" | "near" | "offers";

interface AttentionProps {
  longest: TrackingRow[];
  near: TrackingRow[];
  offers: { row: TrackingRow; days: number }[];
  /** Full counts; the lists above are cut to the first few. */
  totals: { longest: number; near: number; offers: number };
  /** Lights the matching provinces on the map while a row is hovered. */
  onSpot: SpotFn;
  tab: AttentionTab;
  onTab: (t: AttentionTab) => void;
}

/** A list row that opens the tracking page filtered to it and shows the requisition's detail on hover. */
function Item({ row, title, sub, trailing, onSpot }: { row: TrackingRow; title: string; sub: string; trailing: ReactNode; onSpot: SpotFn }) {
  const { bind } = useTip();
  return (
    <li>
      <Link
        href={trackingHref({ q: row.branchName })}
        {...bind(<RowTip r={row} extra={<TipNote>คลิกเพื่อดูสาขานี้ในหน้าติดตาม</TipNote>} />, { onSpot: (on) => onSpot(on ? (x) => x.id === row.id : null, on ? title : undefined) })}
        className={cn(SPOT, ROW, "flex items-center gap-3 px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50")}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-foreground/65">{sub}</span>
        </span>
        {trailing}
      </Link>
    </li>
  );
}

export function AttentionCard({ longest, near, offers, totals, onSpot, tab, onTab }: AttentionProps) {
  const stale = offers.filter((o) => o.days > OFFER_STALE_DAYS).length;
  return (
    <section id="attention" aria-labelledby="attention-title" className={cn("overflow-hidden rounded-3xl scroll-mt-4", GLASS)}>
      <CardHeader id="attention-title" icon={<Hourglass />} title="ตำแหน่งที่ต้องเร่ง" />
      <div className="px-5 pb-3">
        <Pills
          label="เลือกรายการ"
          value={tab}
          onChange={onTab}
          options={[
            { value: "longest", label: "ค้างนานสุด", count: totals.longest },
            { value: "near", label: "ใกล้เกิน SLA", count: totals.near },
            { value: "offers", label: "Offer รอเข้างาน", count: totals.offers },
          ]}
        />
      </div>
      <ul className={cn(SPOT_GROUP, "divide-y divide-black/[0.06] border-t border-black/[0.06] py-1")}>
        {tab === "longest" &&
          longest.map((r) => (
            <Item
              key={r.id}
              row={r}
              onSpot={onSpot}
              title={`${r.positionName} · ${r.branchName}`}
              sub={`${r.region} · TA ${r.taName || "-"}`}
              trailing={<TatBadge tat={r.tat} band={r.agingBand} />}
            />
          ))}
        {tab === "near" &&
          near.map((r) => (
            <Item
              key={r.id}
              row={r}
              onSpot={onSpot}
              title={`${r.positionName} · ${r.branchName}`}
              sub={`${r.region} · TA ${r.taName || "-"} · TAT ${r.tat}/${r.slaDays} วัน`}
              trailing={
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 tabular-nums">
                  {r.slaDays - r.tat === 0 ? "ครบ SLA วันนี้" : `เหลือ ${r.slaDays - r.tat} วัน`}
                </span>
              }
            />
          ))}
        {tab === "offers" &&
          offers.map(({ row: r, days }) => (
            <Item
              key={r.id}
              row={r}
              onSpot={onSpot}
              title={`${r.offerName ?? "-"} · ${r.positionName}`}
              sub={`${r.branchName} · TA ${r.taName || "-"}${r.offerChannel ? ` · ${r.offerChannel}` : ""}`}
              trailing={
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs tabular-nums", days > OFFER_STALE_DAYS ? "bg-red-100 font-medium text-[#b91c1c]" : "bg-black/5 text-foreground/70")}>
                  Offer แล้ว {days} วัน
                </span>
              }
            />
          ))}
      </ul>
      {((tab === "longest" && longest.length === 0) || (tab === "near" && near.length === 0) || (tab === "offers" && offers.length === 0)) && (
        <p className="border-t border-black/[0.06] px-5 py-8 text-center text-sm text-foreground/65">
          {tab === "near" ? `ไม่มีตำแหน่งที่ใช้เวลาเกิน ${NEAR_SLA_PCT}% ของ SLA` : tab === "offers" ? "ไม่มี Offer ที่รอเข้างาน" : "ไม่มีตำแหน่งว่างค้าง"}
        </p>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] px-5 py-2.5 text-xs text-foreground/65">
        <span>
          {tab === "offers" && stale > 0 ? `Offer เกิน ${OFFER_STALE_DAYS} วันแล้วยังไม่เข้างาน ${stale} ราย` : "แสดงสูงสุด 5 รายการ"}
        </span>
        <Link href="/tracking?mine=0" className="rounded-full bg-ink-chip px-3 py-1 text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          ดูทั้งหมดในหน้าติดตาม
        </Link>
      </footer>
    </section>
  );
}

/* ---------- Group by position / branch / BU ---------- */

const GROUP_NOUN = { positionName: "ตำแหน่ง", branchName: "สาขา", bu: "BU" } as const;

export function GroupCard({ rows, onSpot }: { rows: TrackingRow[]; onSpot: SpotFn }) {
  const { bind } = useTip();
  const [by, setBy] = useState<"positionName" | "branchName" | "bu">("positionName");
  const all = groupOpen(rows, by, Infinity);
  const groups = all.slice(0, 5);
  const max = Math.max(1, ...groups.map((g) => g.open));
  return (
    <section aria-labelledby="group-title" className={cn("overflow-hidden rounded-3xl", GLASS)}>
      <CardHeader
        id="group-title"
        icon={<Layers />}
        title="แยกตามตำแหน่ง / สาขา / BU"
        aside={
          <Pills
            label="จัดกลุ่มตาม"
            value={by}
            onChange={setBy}
            options={[
              { value: "positionName", label: "ตำแหน่ง" },
              { value: "branchName", label: "สาขา" },
              { value: "bu", label: "BU" },
            ]}
          />
        }
      />
      {groups.length === 0 ? (
        <p className="border-t border-black/[0.06] px-5 py-8 text-center text-sm text-foreground/65">ไม่มีข้อมูล</p>
      ) : (
        <ul className={cn(SPOT_GROUP, "divide-y divide-black/[0.06] border-t border-black/[0.06] py-1")}>
          {groups.map((g) => (
            <li key={g.name}>
              <Link
                href={trackingHref(by === "bu" ? { bu: g.name } : { q: g.name })}
                {...bind(<StatsTip title={g.name} sub={GROUP_NOUN[by]} s={g} hint="คลิกเพื่อดูรายการในหน้าติดตาม" />, {
                  onSpot: (on) => onSpot(on ? (r) => r[by] === g.name : null, on ? g.name : undefined),
                })}
                className={cn(SPOT, ROW, "flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50")}
              >
                <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">{g.name}</span>
                <StackBar s={g} max={max} className="w-full basis-full sm:w-40 sm:basis-40" />
                <span className="flex items-center gap-3 text-sm tabular-nums">
                  <span className="w-8 text-right font-heading font-medium">{g.open}</span>
                  <span className="w-20 text-foreground/65">{g.avgAging === null ? "-" : `เฉลี่ย ${g.avgAging} วัน`}</span>
                  <span className={cn("w-20 rounded-full px-2.5 py-0.5 text-center text-xs", g.notMeet > 0 ? "bg-red-100 text-[#b91c1c]" : "bg-black/5 text-foreground/65")}>Not Meet {g.notMeet}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] px-5 py-2.5 text-xs text-foreground/65">
        <span>{all.length > groups.length ? `แสดง 5 จาก ${all.length} ${GROUP_NOUN[by]}` : "แสดงสูงสุด 5 รายการ"}</span>
        <Link href="/tracking?mine=0" className="rounded-full bg-ink-chip px-3 py-1 text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          ดูทั้งหมดในหน้าติดตาม
        </Link>
      </footer>
    </section>
  );
}
