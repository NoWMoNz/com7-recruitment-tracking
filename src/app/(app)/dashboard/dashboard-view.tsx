"use client";

import { useCallback, useEffect, useMemo, useState, type PointerEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Briefcase, Download, Gauge, Map as MapIcon, MapPin, Sparkles, Users, X } from "lucide-react";
import { BAND_CLASS, BAND_LABEL } from "@/components/aging-badge";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { PeopleFilters } from "@/components/people-filters";
import { Dropdown } from "@/components/ui/dropdown";
import { longestOpen, momentum, nearSla, offersWaiting, provinceStats, statsOf, summarize, sumTrend, type RowStats, type TrendMonth } from "@/lib/domain/dashboard";
import type { OfferOutcome, UpcomingResign } from "@/lib/domain/outlook";
import { matchesPeople, peopleOptions, type People, type PeopleFilter } from "@/lib/domain/people";
import type { AgingBand } from "@/lib/domain/tat";
import type { TrackingRow } from "@/lib/domain/tracking";
import { cn } from "@/lib/utils";
import { normalizeProvince } from "@/lib/geo/province";
import { TrendChart } from "./trend-chart";
import { ThailandMap } from "./thailand-map";
import { ActionTiles, AttentionCard, GroupCard, OutlookTiles, type ApprovalItem, type AttentionTab, type HoldItem } from "./dashboard-sections";
import { BANDS, BAND_DOT, StatsTip, trackingHref, type NoteFn, type SpotFn, type SummaryNote } from "./dashboard-tips";
import { CARD, GLASS, IconChip, ROW, SPOT, SPOT_BAR, SPOT_BAR_GROUP, SPOT_GROUP, SmoothHeight, StackBar, SWELL, useSettle } from "./dashboard-ui";
import { TipNote, TipProvider, TipRow, TipTitle, useTip } from "./hover-tip";

interface Props {
  rows: TrackingRow[];
  /** Region, BU, AM, RM and TA of each hire / turndown this month. */
  hiredRegions: ({ region: string; bu: string } & People)[];
  turndownRegions: ({ region: string; bu: string } & People)[];
  trend: TrendMonth[];
  approvals: ApprovalItem[];
  holds: HoldItem[];
  /** Resignations still to take effect and the Offers of the last 90 days. */
  resigns: UpcomingResign[];
  outcomes: OfferOutcome[];
  today: string;
  isAdmin: boolean;
  title: string;
}

/** Half-circle meter in the spirit of the temperature dial in the reference. */
function HalfGauge({ pct, tat }: { pct: number | null; tat: { meet: number; notMeet: number; inProgress: number } }) {
  const { bind } = useTip();
  const R = 70;
  const arc = `M ${80 - R} 80 A ${R} ${R} 0 0 1 ${80 + R} 80`;
  return (
    <div
      tabIndex={0}
      className="relative mx-auto w-44 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      {...bind(
        <>
          <TipTitle sub="เทียบกับ SLA ของแต่ละตำแหน่ง">ผ่านเกณฑ์ TAT</TipTitle>
          <TipRow dot="#1f9d55" label="Meet (Offer ภายใน SLA)" value={tat.meet} />
          <TipRow dot="#dc2626" label="Not Meet" value={tat.notMeet} tone={tat.notMeet > 0 ? "bad" : undefined} />
          <TipRow dot="#b8b8ae" label="ยังอยู่ในเวลา" value={tat.inProgress} />
          <TipNote>Not Meet = Offer เกิน SLA หรือยังว่างอยู่แต่เลย SLA แล้ว</TipNote>
        </>,
      )}
    >
      <svg viewBox="0 0 160 88" className="w-full" role="img" aria-label={pct === null ? "ยังไม่มีข้อมูล TAT" : `TAT Meet ${pct}%`}>
        <defs>
          <linearGradient id="gauge-fill" x1="0" x2="1">
            <stop offset="0" stopColor="#8fd07b" />
            <stop offset="1" stopColor="#2a8638" />
          </linearGradient>
        </defs>
        <path d={arc} pathLength={100} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={14} strokeLinecap="round" />
        {pct !== null && pct > 0 && <path d={arc} pathLength={100} fill="none" stroke="url(#gauge-fill)" strokeWidth={14} strokeLinecap="round" strokeDasharray={`${pct} 100`} />}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center font-heading text-[2.5rem] leading-none font-light tabular-nums">
        {pct ?? "–"}
        {pct !== null && <span className="ml-0.5 align-top text-sm">%</span>}
      </div>
    </div>
  );
}

/** Row of ticks coloured by aging band, proportional to the count in each band. */
function BandTicks({ bands, avgAging }: { bands: Record<AgingBand, number>; avgAging: number | null }) {
  const { bind } = useTip();
  const COUNT = 18;
  const total = BANDS.reduce((s, b) => s + bands[b], 0);
  const ticks: (AgingBand | null)[] = [];
  if (total > 0) {
    for (const b of BANDS) {
      const n = Math.round((bands[b] / total) * COUNT);
      for (let i = 0; i < n && ticks.length < COUNT; i++) ticks.push(b);
    }
  }
  while (ticks.length < COUNT) ticks.push(total > 0 ? BANDS[BANDS.length - 1] : null);
  return (
    <div
      tabIndex={0}
      aria-label={`ตำแหน่งที่ยังว่างแยกตามอายุ ${BANDS.map((b) => `${BAND_LABEL[b]} ${bands[b]}`).join(", ")}`}
      className="flex h-7 items-end gap-[3px] rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      {...bind(
        <>
          <TipTitle sub="เฉพาะตำแหน่งที่ยังว่าง (ยังไม่ Offer)">อายุตำแหน่งว่าง</TipTitle>
          {BANDS.map((b) => (
            <TipRow key={b} dot={BAND_DOT[b]} label={BAND_LABEL[b]} value={bands[b]} />
          ))}
          <TipNote>ค้างเฉลี่ย {avgAging === null ? "-" : `${avgAging} วัน`}</TipNote>
        </>,
      )}
    >
      {ticks.map((b, i) => (
        <span key={i} className={cn("w-[5px] rounded-full", b ? cn("h-7", BAND_CLASS[b]) : "h-3 bg-black/10")} />
      ))}
    </div>
  );
}

/** Region names that fit under a narrow bar: the HR file uses eight, some of them long. */
const SHORT_REGION: Record<string, string> = {
  กรุงเทพมหานคร: "กทม.",
  ปริมณฑล: "ปริม.",
  ภาคตะวันออกเฉียงเหนือ: "อีสาน",
  ภาคตะวันออก: "ออก",
  ภาคตะวันตก: "ตก",
};
const shortRegion = (name: string) => SHORT_REGION[name] ?? name.replace(/^ภาค/, "");

function RegionBars({
  regions,
  active,
  onPick,
  onSpot,
}: {
  regions: ({ name: string } & RowStats)[];
  active: string;
  onPick: (name: string) => void;
  onSpot: SpotFn;
}) {
  const { bind } = useTip();
  const shown = regions;
  const max = Math.max(1, ...shown.map((r) => r.open));
  return (
    <div className={cn(SPOT_BAR_GROUP, "flex h-20 w-full items-stretch justify-center gap-1.5 pt-5")} role="group" aria-label="ตำแหน่งว่างแยกตามภาค คลิกเพื่อกรอง">
      {shown.map((r, i) => (
        <button
          key={r.name}
          type="button"
          aria-pressed={active === r.name}
          aria-label={`${r.name} ${r.open} ตำแหน่ง`}
          onClick={() => onPick(active === r.name ? "" : r.name)}
          {...bind(<StatsTip title={r.name} s={r} hint={active === r.name ? "คลิกเพื่อดูทุกภาค" : "คลิกเพื่อกรองเฉพาะภาคนี้"} />, {
            onSpot: (on) => onSpot(on ? (x) => x.region === r.name : null, on ? r.name : undefined),
          })}
          className={cn(SPOT_BAR, "group/pick flex max-w-12 min-w-0 flex-1 flex-col items-center gap-1 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}
        >
          <span className="relative flex w-full flex-1 items-end">
            <span
              className={cn(
                "w-full origin-bottom rounded-md transition-transform duration-200 group-hover/pick:scale-x-125 group-hover/pick:scale-y-[1.06] motion-reduce:transition-none",
                i === 0 || active === r.name ? "bg-[#1f9d55]" : "bg-[#1f9d55]/35",
              )}
              style={{ height: `${Math.max(12, (r.open / max) * 100)}%` }}
            />
            <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 scale-75 rounded-full bg-ink-chip px-1.5 py-px text-[10px] font-medium text-white tabular-nums opacity-0 transition-[opacity,transform,scale] duration-150 group-hover/pick:scale-100 group-hover/pick:opacity-100 group-focus-visible/pick:scale-100 group-focus-visible/pick:opacity-100">
              {r.open}
            </span>
          </span>
          <span className={cn("w-full truncate text-center text-[10px] leading-none transition-colors group-hover/pick:font-semibold group-hover/pick:text-foreground", active === r.name ? "font-medium text-foreground" : "text-foreground/65")}>
            {shortRegion(r.name)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Change against the earlier month. A drop is good news for both open positions and days taken. */
function Change({ delta, down, up, unit, since }: { delta: number; down: string; up: string; unit: string; since: string }) {
  if (delta === 0) return <span className="text-xs text-foreground/65">เท่ากับ{since}</span>;
  const good = delta < 0;
  const Icon = good ? ArrowDown : ArrowUp;
  // A frosted pill like the other glass pieces; only the small bead carries the pastel mint (good) or peach (watch).
  return (
    <span className="liquid-glass-tile inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-xs tabular-nums text-foreground/80">
      <span
        aria-hidden
        className="grid size-5 place-items-center rounded-full text-foreground/70 shadow-[inset_0_1px_1px_rgb(255_255_255/0.9)]"
        style={{ background: good ? "linear-gradient(135deg,#c9f4de,#bfe6ff)" : "linear-gradient(135deg,#ffe1c4,#ffc9e6)" }}
      >
        <Icon className="size-3" />
      </span>
      <span>
        {good ? down : up} <span className="font-heading text-sm font-medium text-foreground">{Math.abs(delta)}</span>
        {unit} จาก{since}
      </span>
    </span>
  );
}

function initial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function DashboardView(props: Props) {
  return (
    <TipProvider>
      <DashboardBody {...props} />
    </TipProvider>
  );
}

function DashboardBody({ rows: allRows, hiredRegions, turndownRegions, trend, approvals, holds, resigns, outcomes, today, isAdmin, title }: Props) {
  const { bind } = useTip();
  const [region, setRegion] = useState("");
  // Request date (วันที่แจ้งสรรหา); null = every date. Everything below counts only the positions requested in it.
  const [range, setRange] = useState<DateRangeValue>(null);
  // Business unit (Group ใหญ่); "" = every BU. Like the date range, it narrows every card on the page.
  const [bu, setBu] = useState("");
  // AM / RM / TA; like BU, they narrow every card on the page.
  const [people, setPeople] = useState<PeopleFilter>({});
  const buNames = useMemo(() => [...new Set(allRows.map((r) => r.bu))].sort((a, b) => a.localeCompare(b, "th")), [allRows]);
  const peopleChoices = useMemo(() => peopleOptions(allRows), [allRows]);
  const rows = useMemo(
    () => allRows.filter((r) => (!bu || r.bu === bu) && matchesPeople(r, people) && (!range || (r.requestDate >= range.from && r.requestDate <= range.to))),
    [allRows, bu, people, range],
  );

  const regionNames = useMemo(() => [...new Set(allRows.map((r) => r.region))], [allRows]);
  const [province, setProvince] = useState<string | null>(null);
  // Region filter only: feeds the map so it keeps showing every province in the region while one is picked.
  const inRegion = useMemo(() => (region ? rows.filter((r) => r.region === region) : rows), [rows, region]);
  const provinceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of inRegion) if (!r.upcoming && r.province) m.set(normalizeProvince(r.province), (m.get(normalizeProvince(r.province)) ?? 0) + 1);
    return m;
  }, [inRegion]);
  const scoped = useMemo(() => (province ? inRegion.filter((r) => normalizeProvince(r.province) === province) : inRegion), [inRegion, province]);
  const s = useMemo(() => summarize(scoped), [scoped]);
  // This month against last. The trend is kept per region, so a picked province has no figures of its own.
  const mo = useMemo(() => momentum(sumTrend(trend, { region, bu, ...people })), [trend, region, bu, people]);
  const thisMonth = (x: { region: string; bu: string } & People) => (!region || x.region === region) && (!bu || x.bu === bu) && matchesPeople(x, people);
  const hired = province ? 0 : hiredRegions.filter(thisMonth).length;
  const [attention, setAttention] = useState<AttentionTab>("longest");
  // Provinces another card is pointing at; the map lights them and dims the rest.
  const [spot, setSpot] = useState<ReadonlySet<string> | null>(null);
  // The slice (rows + a name for it) another card is pointing at; the summary card describes it while it lasts.
  // Same idea for cards that are not lists of requisitions (a meter, approvals, a month).
  const [note, setNote] = useState<SummaryNote | null>(null);
  const [focus, setFocus] = useState<{ match: (r: TrackingRow) => boolean; label: string } | null>(null);

  const inView = (x: { region: string; province: string; bu: string } & People) =>
    (!bu || x.bu === bu) && (!region || x.region === region) && (!province || normalizeProvince(x.province) === province) && matchesPeople(x, people);
  const scopedApprovals = useMemo(() => approvals.filter(inView), [approvals, region, province, bu, people]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopedHolds = useMemo(() => holds.filter(inView), [holds, region, province, bu, people]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopedResigns = useMemo(() => resigns.filter(inView), [resigns, region, province, bu, people]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopedOutcomes = useMemo(() => outcomes.filter(inView), [outcomes, region, province, bu, people]); // eslint-disable-line react-hooks/exhaustive-deps
  const longestAll = useMemo(() => longestOpen(scoped, Infinity), [scoped]);
  const nearAll = useMemo(() => nearSla(scoped, undefined, Infinity), [scoped]);
  const waitingAll = useMemo(() => offersWaiting(scoped, today, Infinity), [scoped, today]);
  const pStats = useMemo(() => provinceStats(inRegion), [inRegion]);
  const turndowns = turndownRegions.filter(thisMonth).length;
  const exportHref = `/api/export?${new URLSearchParams(Object.entries({ tab: "monthly", region, bu, ...people }).filter((e): e is [string, string] => Boolean(e[1])))}`;
  // Moving from one item to the next must not flash the overview in between: clearing waits a moment and is cancelled by the next hover.
  const settle = useSettle();
  const spotRows = useCallback<SpotFn>(
    (match, label) => settle(() => {
      setSpot(match ? new Set(inRegion.filter((r) => !r.upcoming && r.province && match(r)).map((r) => normalizeProvince(r.province))) : null);
      setFocus(match && label ? { match, label } : null);
      setNote(null);
    }, !match),
    [inRegion, settle],
  );
  // What the summary card talks about: the slice another card is pointing at, else everything in view.
  // Falls back to every row when the filter in force leaves nothing (hovering another region's bar while one region is picked).
  const focusStats = useMemo(() => {
    if (!focus) return null;
    const hit = scoped.filter(focus.match);
    return statsOf(hit.length > 0 ? hit : rows.filter(focus.match));
  }, [focus, scoped, rows]);
  const view = focusStats ?? note?.stats ?? s;
  const showNote = useCallback<NoteFn>(
    (n) =>
      settle(() => {
        setNote(n);
        setFocus(null);
        setSpot(n?.provinces ? new Set(n.provinces.map(normalizeProvince)) : null);
      }, !n),
    [settle],
  );
  // A slice of the rows as a note: the summary then reads the same as for any other slice.
  const sliceNote = (label: string, rs: TrackingRow[]): SummaryNote => {
    const st = statsOf(rs);
    return {
      label,
      text: `มี ${st.open} ตำแหน่งที่ยังเปิดสรรหา${st.avgAging !== null ? ` โดยว่างค้างเฉลี่ย ${st.avgAging} วัน` : ""}`,
      sub: st.offers > 0 || st.notMeet > 0 ? [st.offers > 0 && `Offer แล้ว ${st.offers}`, st.notMeet > 0 && `เกินเกณฑ์ TAT ${st.notMeet}`].filter(Boolean).join(" · ") : undefined,
      provinces: rs.filter((r) => !r.upcoming && r.province).map((r) => r.province),
      stats: st,
    };
  };
  // Whole-card hover for the three stat cards.
  const cardNote = (n: SummaryNote) => ({
    onPointerEnter: (e: PointerEvent) => e.pointerType !== "touch" && showNote(n),
    onPointerLeave: () => showNote(null),
    onFocus: () => showNote(n),
    onBlur: () => showNote(null),
  });
  // Leaving by a link sends no pointer-leave and the page is kept for the back button, so clear what the summary shows.
  useEffect(() => {
    const clear = () => {
      setNote(null);
      setFocus(null);
      setSpot(null);
    };
    const onClick = (e: MouseEvent) => e.target instanceof Element && e.target.closest("a[href]") && clear();
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", clear);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", clear);
    };
  }, []);
  // The map reports its hovered province as a slice too.
  const hoverProvince = useCallback(
    (name: string | null) => settle(() => {
        setFocus(name ? { match: (r) => normalizeProvince(r.province) === name, label: `จังหวัด${name}` } : null);
        setNote(null);
      }, !name),
    [settle],
  );
  const showNearSla = () => {
    setAttention("near");
    document.getElementById("attention")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const maxTa = Math.max(1, ...s.tas.map((t) => t.open));
  // The region card compares every region, so it ignores the region and province filters; the picked one is highlighted.
  const allRegions = useMemo(() => summarize(rows).regions, [rows]);
  const topRegion = allRegions[0];
  // Heading and caption of the region card describe the top region; the bars between them each describe their own.
  const topNote = topRegion ? cardNote(sliceNote(topRegion.name, rows.filter((r) => r.region === topRegion.name))) : {};

  return (
    <div className="space-y-4">
        <PageHeader
          title={title}
          actions={
            <a
              href={exportHref}
              download
              className="inline-flex items-center gap-2 rounded-full bg-ink-chip px-4 py-2 text-sm text-white transition-colors outline-none hover:bg-ink-chip/85 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Download className="size-4" aria-hidden />
              Export Excel
            </a>
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="dash-region">
            ภาค
          </label>
          <Dropdown
            id="dash-region"
            variant="pill"
            value={region}
            onChange={(r) => {
              setRegion(r);
              setProvince(null);
            }}
            emptyLabel="ทุกภาค"
            options={regionNames.map((r) => ({ value: r, label: r }))}
            className="w-44"
          />
          <label className="sr-only" htmlFor="dash-bu">
            BU
          </label>
          <Dropdown id="dash-bu" variant="pill" value={bu} onChange={setBu} emptyLabel="ทุก BU" options={buNames.map((b) => ({ value: b, label: b }))} className="w-36" />
          <PeopleFilters idPrefix="dash" value={people} onChange={setPeople} options={peopleChoices} />
          <DateRangePicker id="dash-range" allowAll allLabel="ทุกวันที่แจ้งสรรหา" value={range} onChange={setRange} aria-label="วันที่แจ้งสรรหา" className="w-64" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]">
          {/* Summary card: stays in view beside the cards on large screens. */}
          <section
            aria-labelledby="summary-title"
            className="liquid-glass relative z-10 flex min-h-[26rem] flex-col rounded-[2.5rem] p-6 lg:sticky lg:top-5 lg:self-start"
          >
            <div className="flex items-center gap-3">
              <span aria-hidden className="liquid-glass-chip grid size-10 place-items-center rounded-full text-foreground/80">
                <Sparkles className="size-4" />
              </span>
              <h2 id="summary-title" className="font-heading text-base font-medium">
                สรุปภาพรวม
              </h2>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-7 py-8 text-center">
              <SmoothHeight pad={12} className="-mx-3 -my-3 w-[calc(100%+1.5rem)] overflow-hidden px-3 py-3">
                <div key={focus?.label ?? note?.label ?? "all"} className="sum-in">
                  {note ? (
                    <>
                      <p className="text-sm text-foreground/65">{note.label}</p>
                      <p className="mt-2 font-heading text-[1.6rem] leading-snug font-light text-balance">{note.text}</p>
                      {note.sub && <p className="mt-2 text-sm text-foreground/70">{note.sub}</p>}
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-foreground/65">{focus?.label ?? [province ? `จังหวัด${province}` : region || "ทุกภาค", bu].filter(Boolean).join(" · ")}</p>
                      <p className="mt-1 font-heading text-[5.5rem] leading-none font-extralight tracking-tight tabular-nums">{view.open}</p>
                      <p className="mt-2 text-base text-foreground/75">ตำแหน่งที่ยังเปิดสรรหา</p>
                      {!focus && !province && !range && mo.openDelta !== null && (
                        <p className="mt-3">
                          <Change delta={mo.openDelta} down="ลดลง" up="เพิ่มขึ้น" unit=" ตำแหน่ง" since="สิ้นเดือนก่อน" />
                        </p>
                      )}
                    </>
                  )}
                </div>
              </SmoothHeight>

              <div className={cn("w-full space-y-4 transition-opacity duration-300", note && !note.stats && "opacity-40")}>
                <dl className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Offer แล้ว", value: view.offers, unit: "" },
                    { label: "เกินเกณฑ์ TAT", value: view.notMeet, unit: "" },
                    { label: "ว่างค้างเฉลี่ย", value: view.avgAging ?? "–", unit: view.avgAging === null ? "" : " วัน" },
                  ].map((x) => (
                    <div key={x.label} className="liquid-glass-tile rounded-[1.25rem] px-2 py-3">
                      <dd className="font-heading text-2xl leading-none font-light tabular-nums">
                        {x.value}
                        <span className="text-xs">{x.unit}</span>
                      </dd>
                      <dt className="mt-1.5 text-xs text-foreground/65">{x.label}</dt>
                    </div>
                  ))}
                </dl>

                <div role="img" aria-label={`ตำแหน่งที่ยังว่างแยกตามอายุ ${BANDS.map((b) => `${BAND_LABEL[b]} ${view.bands[b]}`).join(", ")}`}>
                  {/* Widths are percentages, not flex-grow: a grow factor only shrinks the bar once it falls below 1, so it stayed full and then vanished. */}
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-black/[0.07]">
                    {BANDS.map((b, i) => {
                      const total = BANDS.reduce((n, x) => n + view.bands[x], 0);
                      const after = BANDS.slice(0, i).some((x) => view.bands[x] > 0);
                      return (
                        <span
                          key={b}
                          className="h-full shrink-0 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                          style={{ width: total ? `${(view.bands[b] / total) * 100}%` : 0, background: BAND_DOT[b], boxShadow: after ? "inset 2px 0 0 rgb(255 255 255 / 0.75)" : undefined }}
                        />
                      );
                    })}
                  </div>
                  <ul className="mt-2.5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-foreground/70">
                    {BANDS.map((b) => (
                      <li key={b} className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: BAND_DOT[b] }} />
                        {BAND_LABEL[b]}
                        <span className="font-heading tabular-nums">{view.bands[b]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <div className="min-w-0 space-y-4">
            {rows.length === 0 ? (
              <p className={cn(CARD, "py-12 text-center text-foreground/65")}>{range ? "ไม่มีตำแหน่งที่แจ้งสรรหาในช่วงวันที่นี้" : "ยังไม่มีตำแหน่งที่กำลังสรรหาในขอบเขตของคุณ"}</p>
            ) : (
              <>
                <dl className={cn(SPOT_GROUP, "grid gap-4 sm:grid-cols-3")}>
                  <div
                    className={cn(CARD, SPOT, SWELL, "flex min-h-52 flex-col p-4")}
                    {...cardNote({
                      label: "ผ่านเกณฑ์ TAT",
                      text:
                        s.tat.meet + s.tat.notMeet > 0
                          ? `ผ่านเกณฑ์ ${s.tat.meet} จาก ${s.tat.meet + s.tat.notMeet} ตำแหน่งที่ตัดสินแล้ว${s.tatMeetPct !== null ? ` (${s.tatMeetPct}%)` : ""}`
                          : "ยังไม่มีตำแหน่งที่ตัดสินเกณฑ์ TAT",
                      sub: `ยังอยู่ในเกณฑ์ ${s.tat.inProgress} · เกินเกณฑ์ ${s.tat.notMeet}`,
                      provinces: scoped.filter((r) => !r.upcoming && r.tatResult === "NotMeet" && r.province).map((r) => r.province),
                      stats: statsOf(scoped.filter((r) => !r.upcoming && r.tatResult === "NotMeet")),
                    })}
                  >
                    <IconChip>
                      <Gauge />
                    </IconChip>
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                      <dt className="sr-only">TAT Meet</dt>
                      <dd className="w-full">
                        <HalfGauge pct={s.tatMeetPct} tat={s.tat} />
                      </dd>
                      <p className="text-sm text-foreground/65">ผ่านเกณฑ์ TAT (Meet)</p>
                      {!province && !range && (
                        <div className="space-y-1.5 text-xs text-foreground/70">
                          {mo.avgTat === null ? (
                            <p>เดือนนี้ยังไม่มี Offer</p>
                          ) : (
                            <>
                              <p>
                                Offer เดือนนี้ใช้เฉลี่ย{" "}
                                <span className={cn("font-heading text-sm font-medium tabular-nums", mo.avgSla !== null && mo.avgTat > mo.avgSla ? "text-[#b91c1c]" : "text-[#177a43]")}>{mo.avgTat}</span> วัน
                              </p>
                              {mo.tatDelta !== null && <Change delta={mo.tatDelta} down="เร็วขึ้น" up="ช้าลง" unit=" วัน" since="เดือนก่อน" />}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={cn(CARD, SPOT, SWELL, "flex min-h-52 flex-col p-4")}
                    {...cardNote(sliceNote(province ? `จังหวัด${province}` : region || "ทุกภาค", scoped))}
                  >
                    <IconChip>
                      <Briefcase />
                    </IconChip>
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                      <BandTicks bands={s.bands} avgAging={s.avgAging} />
                      <dt className="sr-only">ตำแหน่งว่างคงเหลือ</dt>
                      <dd className="font-heading text-[2.5rem] leading-none font-light tabular-nums">{s.open}</dd>
                      <p className="text-sm text-foreground/65">ตำแหน่งที่ยังเปิดสรรหา</p>
                    </div>
                  </div>

                  <div
                    className={cn(CARD, SPOT, SWELL, "flex min-h-52 flex-col p-4")}
                  >
                    <IconChip>
                      <MapPin />
                    </IconChip>
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                      <dt className="sr-only">ภาคที่มีตำแหน่งว่างมากที่สุด</dt>
                      <dd className="font-heading text-[1.6rem] leading-tight font-light" {...topNote}>{topRegion?.name ?? "–"}</dd>
                      <RegionBars
                        regions={allRegions}
                        active={region}
                        onPick={(r) => {
                          setRegion(r);
                          setProvince(null);
                        }}
                        onSpot={spotRows}
                      />
                      <p className="text-sm text-foreground/65" {...topNote}>{topRegion ? `ว่างมากสุด ${topRegion.open} ตำแหน่ง` : "ไม่มีข้อมูล"}</p>
                    </div>
                  </div>
                </dl>

                <ActionTiles approvals={scopedApprovals} holds={scopedHolds} near={nearAll} isAdmin={isAdmin} onShowNearSla={showNearSla} onSpot={spotRows} onNote={showNote} />

                <OutlookTiles resigns={scopedResigns} outcomes={scopedOutcomes} today={today} onNote={showNote} />

                <div className="grid gap-4 xl:grid-cols-2">
                  <AttentionCard
                    longest={longestAll.slice(0, 5)}
                    near={nearAll.slice(0, 5)}
                    offers={waitingAll.slice(0, 5)}
                    totals={{ longest: longestAll.length, near: nearAll.length, offers: waitingAll.length }}
                    onSpot={spotRows}
                    tab={attention}
                    onTab={setAttention}
                  />
                  <GroupCard rows={scoped} onSpot={spotRows} />
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                  <section aria-labelledby="map-title" className={cn("flex flex-col rounded-3xl p-4", GLASS)}>
                    <header className="flex flex-wrap items-center justify-between gap-2 pb-3">
                      <h2 id="map-title" className="flex items-center gap-3 font-heading font-medium">
                        <IconChip>
                          <MapIcon />
                        </IconChip>
                        แผนที่จังหวัด
                      </h2>
                      {province && (
                        <button
                          type="button"
                          onClick={() => setProvince(null)}
                          aria-label={`ล้างจังหวัด ${province}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-ink-chip py-1 pr-2.5 pl-3 text-xs text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {province}
                          <X className="size-3" aria-hidden />
                        </button>
                      )}
                    </header>
                    <ThailandMap
                      counts={provinceCounts}
                      selected={province}
                      onSelect={setProvince}
                      highlight={spot}
                      onHover={hoverProvince}
                      describe={(name) => {
                        const st = pStats.get(name);
                        return st ? (
                          <StatsTip title={name} s={st} hint={province === name ? "คลิกเพื่อดูทุกจังหวัด" : "คลิกเพื่อกรองจังหวัดนี้"} />
                        ) : (
                          <TipTitle sub="ไม่มีตำแหน่งที่เปิดสรรหา">{name}</TipTitle>
                        );
                      }}
                    />
                    <p className="pt-2 text-center text-xs text-foreground/65">{province ? `${scoped.length} ตำแหน่งใน${province}` : "คลิกจังหวัดสีเขียวเพื่อกรอง สีเข้ม = ว่างมาก"}</p>
                  </section>

                  {/* The map is the tall card, so the trend fills the space the TA list leaves beside it. */}
                  <div className="min-w-0 space-y-4">
                  <section aria-labelledby="ta-title" className={cn("overflow-hidden rounded-3xl", GLASS)}>
                    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-4 pb-3">
                      <h2 id="ta-title" className="flex items-center gap-3 font-heading font-medium">
                        <IconChip>
                          <Users />
                        </IconChip>
                        รายผู้รับผิดชอบ (TA)
                      </h2>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-foreground/65">
                        <span className="rounded-full bg-black/5 px-3 py-1">Offer {s.offers}</span>
                        <span
                          tabIndex={0}
                          className="rounded-full bg-black/5 px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          {...bind(
                            <>
                              <TipTitle sub="เดือนนี้ ไม่แยกตามจังหวัด">เข้างานแล้ว</TipTitle>
                              Offer ที่จับคู่กับพนักงานใหม่ในเดือนนี้
                            </>,
                          )}
                        >
                          เข้างานเดือนนี้ {hired}
                        </span>
                        <span
                          tabIndex={0}
                          className="rounded-full bg-black/5 px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          {...bind(
                            <>
                              <TipTitle sub="เดือนนี้ ไม่แยกตามจังหวัด">Turndown</TipTitle>
                              Offer ที่ผู้สมัครปฏิเสธ แล้วตำแหน่งกลับมาว่าง
                            </>,
                          )}
                        >
                          Turndown {turndowns}
                        </span>
                        <span className="rounded-full bg-ink-chip px-3 py-1 text-white">{s.tas.length} คน</span>
                      </span>
                    </header>

                    <ul className={cn(SPOT_GROUP, "divide-y divide-black/[0.06] border-t border-black/[0.06] py-1")}>
                      {s.tas.map((t) => (
                        <li
                          key={t.key || "none"}
                          className={cn(SPOT, ROW, "flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3")}
                          {...bind(<StatsTip title={t.name || "ยังไม่มีเจ้าของ"} sub={t.key.includes("@") ? t.key : undefined} s={t} hint={t.name ? "คลิกชื่อเพื่อดูในหน้าติดตาม" : undefined} />, {
                            onSpot: (on) => spotRows(on ? (r) => r.ta === t.key : null, on ? `TA ${t.name || "ยังไม่มีเจ้าของ"}` : undefined),
                          })}
                        >
                          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-chip font-heading text-sm text-white">
                            {initial(t.name || "?")}
                          </span>
                          {t.name ? (
                            <Link href={trackingHref({ q: t.name })} className="min-w-0 flex-1 basis-40 truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                              {t.name}
                            </Link>
                          ) : (
                            <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">ยังไม่มีเจ้าของ</span>
                          )}
                          <StackBar s={t} max={maxTa} className="w-full basis-full sm:w-40 sm:basis-40" />
                          <span className="flex items-center gap-3 text-sm tabular-nums">
                            <span className="w-8 text-right font-heading font-medium">{t.open}</span>
                            <span className="w-16 text-foreground/65">Offer {t.offers}</span>
                            <span className={cn("w-20 rounded-full px-2.5 py-0.5 text-center text-xs", t.notMeet > 0 ? "bg-red-100 text-[#b91c1c]" : "bg-black/5 text-foreground/65")}>Not Meet {t.notMeet}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <TrendChart trend={trend} region={region} bu={bu} people={people} onNote={showNote} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
  );
}
