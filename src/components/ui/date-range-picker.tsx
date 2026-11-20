"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Popover } from "radix-ui";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatThaiDate, parseUserDate, todayBangkok } from "@/lib/domain/dates";
import { monthRange, previousMonth } from "@/lib/domain/report";
import { cn } from "@/lib/utils";
import { POPOVER_SURFACE, TRIGGER_BASE, TRIGGER_VARIANT } from "./dropdown";
import { MONTHS, MonthGrid, NavButton, WEEKDAYS, addMonthsTo, weekday, ymd } from "./date-picker";

/** null = every day on record ("ทั้งหมด"); otherwise "YYYY-MM-DD" for both ends, inclusive. */
export type DateRangeValue = { from: string; to: string } | null;

interface Props {
  id?: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Offers a "ทั้งหมด" choice (every day on record). */
  allowAll?: boolean;
  /** What that choice reads on the button, when "ทั้งหมด" alone would not say which dates (e.g. "ทุกวันที่แจ้งสรรหา"). */
  allLabel?: string;
  variant?: keyof typeof TRIGGER_VARIANT;
  className?: string;
  "aria-label"?: string;
}

const firstOf = (d: string) => `${d.slice(0, 7)}-01`;
const label = (v: DateRangeValue, all: string) => (v === null ? all : v.from === v.to ? formatThaiDate(v.from) : `${formatThaiDate(v.from)} – ${formatThaiDate(v.to)}`);

/** One month of day buttons; blanks pad the first week so the weeks line up Monday to Sunday. */
function Month({
  first,
  band,
  today,
  focus,
  onPick,
  onHover,
  onTitle,
  prev,
  next,
  nextOnSmall,
}: {
  first: string;
  band: { a: string; b: string } | null;
  today: string;
  focus: string;
  onPick: (d: string) => void;
  onHover: (d: string | null) => void;
  onTitle: () => void;
  prev?: () => void;
  next?: () => void;
  /** Shows the next-month arrow here too when the second month is hidden (narrow screens). */
  nextOnSmall?: () => void;
}) {
  const y = Number(first.slice(0, 4));
  const m = Number(first.slice(5, 7)) - 1;
  const lead = weekday(first);
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: dim }, (_, i) => ymd(y, m, i + 1))];
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between">
        {prev ? (
          <NavButton label="เดือนก่อน" onClick={prev}>
            <ChevronLeft className="size-4" aria-hidden />
          </NavButton>
        ) : (
          <span className="size-8" aria-hidden />
        )}
        <button
          type="button"
          onClick={onTitle}
          aria-label="เลือกเดือนหรือปี"
          className="rounded-full px-3 py-1 font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {MONTHS[m]} {y}
        </button>
        {next ? (
          <NavButton label="เดือนถัดไป" onClick={next}>
            <ChevronRight className="size-4" aria-hidden />
          </NavButton>
        ) : nextOnSmall ? (
          <span className="sm:hidden">
            <NavButton label="เดือนถัดไป" onClick={nextOnSmall}>
              <ChevronRight className="size-4" aria-hidden />
            </NavButton>
          </span>
        ) : (
          <span className="size-8" aria-hidden />
        )}
      </div>
      <div role="row" className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <span key={w} role="columnheader" className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div key={first} role="grid" aria-label={`${MONTHS[m]} ${y}`} className="grid animate-in grid-cols-7 duration-200 fade-in-0 motion-reduce:animate-none">
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const start = band?.a === d;
          const end = band?.b === d;
          const single = band !== null && band.a === band.b;
          const inBand = band !== null && d >= band.a && d <= band.b && !single;
          const col = i % 7;
          // The band is one continuous strip behind the days: it starts at the middle of the first day and ends at the middle of the last,
          // and gets a rounded cap wherever it breaks (start of a week, end of a week, start or end of the month).
          const capLeft = !start && (col === 0 || d === first);
          const capRight = !end && (col === 6 || i === cells.length - 1);
          return (
            <div key={d} className="relative grid h-10 place-items-center">
              {inBand && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-0.5 bg-black/[0.055]",
                    start ? "left-1/2" : "left-0",
                    end ? "right-1/2" : "right-0",
                    capLeft && "rounded-l-full",
                    capRight && "rounded-r-full",
                  )}
                />
              )}
              <button
                type="button"
                role="gridcell"
                data-date={d}
                tabIndex={d === focus ? 0 : -1}
                aria-selected={start || end}
                aria-label={formatThaiDate(d)}
                aria-current={d === today ? "date" : undefined}
                onClick={() => onPick(d)}
                onPointerEnter={() => onHover(d)}
                onFocus={() => onHover(d)}
                className={cn(
                  "relative grid size-9 place-items-center rounded-full text-sm tabular-nums outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/60",
                  start || end ? "bg-ink-chip font-medium text-white" : d === today ? "font-semibold ring-1 ring-foreground/30" : "",
                  !(start || end) && (inBand ? "hover:bg-black/[0.08]" : "hover:bg-muted"),
                )}
              >
                {Number(d.slice(8, 10))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pick a from–to range on two side-by-side months (one on a narrow screen). Click a day to start, click another to finish;
 * the From / To boxes take typed dd/mm/yyyy dates, shortcuts fill both, and nothing changes until "เลือก".
 */
export function DateRangePicker({ id, value, onChange, allowAll = false, allLabel = "ทั้งหมด", variant = "pill", className, ...rest }: Props) {
  const today = todayBangkok();
  const [open, setOpen] = useState(false);
  // What is being edited: the two ends (`to` is empty while the second click is still to come) and whether it means everything.
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [all, setAll] = useState(false);
  const [left, setLeft] = useState(firstOf(today));
  const [view, setView] = useState<"days" | "months">("days");
  const [monthsYear, setMonthsYear] = useState(Number(today.slice(0, 4)));
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState(today);
  const [text, setText] = useState({ from: "", to: "" });
  const gridRef = useRef<HTMLDivElement>(null);

  const show = (d: { from: string; to: string }) => {
    setDraft(d);
    setText({
      from: d.from ? formatThaiDate(d.from) : "",
      to: d.to ? formatThaiDate(d.to) : "",
    });
  };
  /** Moves the calendar so the month holding `d` is one of the two shown. */
  const reveal = (d: string) => {
    const f = firstOf(d);
    if (f < left) setLeft(f);
    else if (f > addMonthsTo(left, 1)) setLeft(addMonthsTo(f, -1));
  };

  const openChanged = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    const v = value ?? (allowAll ? null : { from: today, to: today });
    setAll(v === null);
    show(v ?? { from: "", to: "" });
    const anchor = v?.from ?? today;
    setLeft(firstOf(anchor));
    setFocus(anchor);
    setView("days");
    setHover(null);
  };

  useEffect(() => {
    if (open && view === "days") gridRef.current?.querySelector<HTMLElement>(`[data-date="${focus}"]`)?.focus({ preventScroll: true });
  }, [focus, left, open, view]);

  const pick = (d: string) => {
    setAll(false);
    setFocus(d);
    if (!draft.from || draft.to) show({ from: d, to: "" });
    else show(d < draft.from ? { from: d, to: draft.from } : { from: draft.from, to: d });
  };

  const typed = (end: "from" | "to") => {
    const parsed = parseUserDate(text[end]);
    if (!parsed) return show(draft); // not a date: put back what was there
    setAll(false);
    const next = { ...draft, [end]: parsed };
    if (next.from && next.to && next.from > next.to) show({ from: next.to, to: next.from });
    else show(next);
    reveal(parsed);
  };

  // While the second click is pending, the band follows the pointer.
  const band: { a: string; b: string } | null = all
    ? null
    : draft.from && draft.to
      ? { a: draft.from, b: draft.to }
      : draft.from
        ? hover && hover !== draft.from
          ? hover < draft.from
            ? { a: hover, b: draft.from }
            : { a: draft.from, b: hover }
          : { a: draft.from, b: draft.from }
        : null;

  const thisMonth = monthRange(today.slice(0, 7));
  const lastMonth = monthRange(previousMonth(today.slice(0, 7)));
  const shortcuts: {
    text: string;
    set: { from: string; to: string } | null;
  }[] = [
    { text: "วันนี้", set: { from: today, to: today } },
    { text: "7 วันล่าสุด", set: { from: addDays(today, -6), to: today } },
    { text: "30 วันล่าสุด", set: { from: addDays(today, -29), to: today } },
    { text: "เดือนนี้", set: { from: thisMonth.first, to: thisMonth.last } },
    { text: "เดือนก่อน", set: { from: lastMonth.first, to: lastMonth.last } },
    ...(allowAll ? [{ text: "ทั้งหมด", set: null }] : []),
  ];
  const applyShortcut = (set: { from: string; to: string } | null) => {
    if (set === null) {
      setAll(true);
      show({ from: "", to: "" });
      return;
    }
    setAll(false);
    show(set);
    setFocus(set.from);
    setLeft(firstOf(set.from));
  };

  const ready = all || Boolean(draft.from);
  const commit = () => {
    if (!ready) return;
    onChange(all ? null : { from: draft.from, to: draft.to || draft.from });
    setOpen(false);
  };

  const onGridKey = (e: KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in step) {
      e.preventDefault();
      const target = addDays(focus, step[e.key]);
      setFocus(target);
      setHover(target);
      reveal(target);
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const target = addMonthsTo(focus, e.key === "PageUp" ? -1 : 1);
      setFocus(target);
      reveal(target);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={openChanged}>
      <Popover.Trigger asChild>
        <button id={id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={rest["aria-label"]} className={cn(TRIGGER_BASE, TRIGGER_VARIANT[variant], className)}>
          <span className="min-w-0 flex-1 truncate text-left tabular-nums">{label(value, allLabel)}</span>
          <CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          aria-label="เลือกช่วงวันที่"
          className={cn(POPOVER_SURFACE, "w-[min(46rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl p-0")}
        >
          <div className="flex flex-col sm:flex-row">
            {/* Shortcuts: a side list on a wide screen, a scrolling strip on a narrow one. */}
            <div
              role="group"
              aria-label="ช่วงที่ใช้บ่อย"
              className="flex shrink-0 gap-1 overflow-x-auto border-b border-black/[0.06] bg-black/[0.025] p-2.5 [scrollbar-width:none] sm:w-40 sm:flex-col sm:overflow-visible sm:border-r sm:border-b-0 sm:p-3"
            >
              {shortcuts.map((s) => {
                const on = s.set === null ? all : !all && draft.from === s.set.from && draft.to === s.set.to;
                return (
                  <button
                    key={s.text}
                    type="button"
                    aria-pressed={on}
                    onClick={() => applyShortcut(s.set)}
                    className={cn(
                      "shrink-0 rounded-xl px-3 py-2 text-left text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                      on ? "bg-white font-medium shadow-sm ring-1 ring-black/[0.06]" : "text-foreground/70 hover:bg-black/[0.05] hover:text-foreground",
                    )}
                  >
                    {s.text}
                  </button>
                );
              })}
            </div>

            <div className="min-w-0 flex-1 p-5">
              {view === "months" ? (
                <div className="mx-auto w-64">
                  <MonthGrid
                    year={monthsYear}
                    month={null}
                    current={{
                      y: Number(left.slice(0, 4)),
                      m: Number(left.slice(5, 7)) - 1,
                    }}
                    onYear={setMonthsYear}
                    onPick={(m) => {
                      setLeft(ymd(monthsYear, m, 1));
                      setView("days");
                    }}
                  />
                </div>
              ) : (
                <div ref={gridRef} onKeyDown={onGridKey} onPointerLeave={() => setHover(null)} className="grid gap-x-8 sm:grid-cols-2">
                  <Month
                    first={left}
                    band={band}
                    today={today}
                    focus={focus}
                    onPick={pick}
                    onHover={setHover}
                    onTitle={() => {
                      setMonthsYear(Number(left.slice(0, 4)));
                      setView("months");
                    }}
                    prev={() => setLeft(addMonthsTo(left, -1))}
                    nextOnSmall={() => setLeft(addMonthsTo(left, 1))}
                  />
                  <div className="hidden sm:block">
                    <Month
                      first={addMonthsTo(left, 1)}
                      band={band}
                      today={today}
                      focus={focus}
                      onPick={pick}
                      onHover={setHover}
                      onTitle={() => {
                        setMonthsYear(Number(addMonthsTo(left, 1).slice(0, 4)));
                        setLeft(addMonthsTo(left, 1));
                        setView("months");
                      }}
                      next={() => setLeft(addMonthsTo(left, 1))}
                    />
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-black/[0.06] pt-4">
                {(["from", "to"] as const).map((end, i) => (
                  <div key={end} className="flex items-center gap-3">
                    {i === 1 && <ArrowRight className="size-4 text-muted-foreground" aria-hidden />}
                    <label className="relative block">
                      <span className="absolute -top-2 left-3 bg-white px-1 text-xs text-muted-foreground">{end === "from" ? "ตั้งแต่" : "ถึง"}</span>
                      <input
                        inputMode="numeric"
                        placeholder={all ? "ทั้งหมด" : "วว/ดด/ปปปป"}
                        value={text[end]}
                        onChange={(e) => setText((t) => ({ ...t, [end]: e.target.value }))}
                        onBlur={() => text[end] !== (draft[end] ? formatThaiDate(draft[end]) : "") && typed(end)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            typed(end);
                          }
                        }}
                        className="h-11 w-36 rounded-xl border border-input bg-white px-3 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
                      />
                    </label>
                  </div>
                ))}
                <span className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-11 items-center rounded-xl px-4 text-sm text-foreground/70 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={commit}
                    className="inline-flex h-11 items-center rounded-xl bg-ink-chip px-6 text-sm font-medium text-white outline-none transition-colors hover:bg-ink-chip/90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
                  >
                    เลือก
                  </button>
                </span>
              </div>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
