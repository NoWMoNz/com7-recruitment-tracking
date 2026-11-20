"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Popover } from "radix-ui";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { formatThaiDate, todayBangkok } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import { POPOVER_SURFACE, TRIGGER_BASE, TRIGGER_VARIANT } from "./dropdown";

export const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const WEEKDAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const toMs = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDaysTo = (s: string, n: number) => fromMs(toMs(s) + n * DAY_MS);
/** Move by whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsTo(s: string, n: number) {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7)) - 1 + n;
  const ty = y + Math.floor(m / 12);
  const tm = ((m % 12) + 12) % 12;
  const dim = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return ymd(ty, tm, Math.min(Number(s.slice(8, 10)), dim));
}
export const weekday = (s: string) => (new Date(toMs(s)).getUTCDay() + 6) % 7; // Monday = 0

interface CommonProps {
  id?: string;
  variant?: keyof typeof TRIGGER_VARIANT;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  "aria-label"?: string;
}

export const NavButton = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} aria-label={label} className="grid size-8 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
    {children}
  </button>
);

/** Month grid with year arrows; shared by the date picker's month view and MonthPicker. */
export function MonthGrid({ year, month, current, onYear, onPick }: { year: number; month: number | null; current: { y: number; m: number } | null; onYear: (y: number) => void; onPick: (m: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <NavButton label="ปีก่อน" onClick={() => onYear(year - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
        </NavButton>
        <span className="font-medium tabular-nums">{year}</span>
        <NavButton label="ปีถัดไป" onClick={() => onYear(year + 1)}>
          <ChevronRight className="size-4" aria-hidden />
        </NavButton>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {MONTHS_SHORT.map((label, m) => {
          const on = current?.y === year && current.m === m;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              aria-label={`${MONTHS[m]} ${year}`}
              onClick={() => onPick(m)}
              className={cn("h-10 rounded-xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50", on ? "bg-ink-chip font-medium text-white" : month === m ? "bg-muted font-medium" : "hover:bg-muted")}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface DateProps extends CommonProps {
  /** "YYYY-MM-DD" or "". */
  value: string;
  onChange: (value: string) => void;
  /** Earliest / latest selectable day. */
  min?: string;
  max?: string;
  placeholder?: string;
  /** Shows a "ล้าง" button. */
  clearable?: boolean;
}

/** Calendar popover: Monday first, Thai month/weekday names, dd/mm/yyyy, min/max aware, keyboard friendly. */
export function DatePicker({ id, value, onChange, min, max, placeholder = "วว/ดด/ปปปป", clearable, variant = "field", className, disabled, invalid, describedBy, ...rest }: DateProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months">("days");
  const [focus, setFocus] = useState(value || todayBangkok());
  const [monthsYear, setMonthsYear] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const today = todayBangkok();
  const inRange = (d: string) => (!min || d >= min) && (!max || d <= max);

  const openChanged = (next: boolean) => {
    setOpen(next);
    if (next) {
      const start = value || (inRange(today) ? today : min && today < min ? min : max && today > max ? max : today);
      setFocus(start);
      setView("days");
    }
  };

  // Keep keyboard focus on the focused day (including after the month changes).
  useEffect(() => {
    if (open && view === "days") gridRef.current?.querySelector<HTMLElement>(`[data-date="${focus}"]`)?.focus({ preventScroll: true });
  }, [focus, open, view]);

  const y = Number(focus.slice(0, 4));
  const m = Number(focus.slice(5, 7)) - 1;
  const first = ymd(y, m, 1);
  const lead = weekday(first);
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const weeks = Math.ceil((lead + dim) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDaysTo(first, i - lead));

  const pick = (d: string) => {
    if (!inRange(d)) return;
    onChange(d);
    setOpen(false);
  };
  const onGridKey = (e: KeyboardEvent) => {
    const moves: Record<string, string> = {
      ArrowLeft: addDaysTo(focus, -1),
      ArrowRight: addDaysTo(focus, 1),
      ArrowUp: addDaysTo(focus, -7),
      ArrowDown: addDaysTo(focus, 7),
      PageUp: addMonthsTo(focus, -1),
      PageDown: addMonthsTo(focus, 1),
      Home: addDaysTo(focus, -weekday(focus)),
      End: addDaysTo(focus, 6 - weekday(focus)),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setFocus(moves[e.key]);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={openChanged}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-label={rest["aria-label"]}
          disabled={disabled}
          className={cn(TRIGGER_BASE, TRIGGER_VARIANT[variant], className)}
        >
          <span className={cn("min-w-0 flex-1 truncate text-left tabular-nums", !value && "text-muted-foreground")}>{value ? formatThaiDate(value) : placeholder}</span>
          <CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} onOpenAutoFocus={(e) => e.preventDefault()} className={cn(POPOVER_SURFACE, "w-[19.5rem] p-3")} aria-label="เลือกวันที่">
          {view === "months" ? (
            <MonthGrid
              year={monthsYear}
              month={null}
              current={{ y, m }}
              onYear={setMonthsYear}
              onPick={(mm) => {
                setFocus(addMonthsTo(ymd(monthsYear, mm, 1), 0));
                setView("days");
              }}
            />
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <NavButton label="เดือนก่อน" onClick={() => setFocus(addMonthsTo(focus, -1))}>
                  <ChevronLeft className="size-4" aria-hidden />
                </NavButton>
                <button
                  type="button"
                  onClick={() => {
                    setMonthsYear(y);
                    setView("months");
                  }}
                  aria-label="เลือกเดือนหรือปี"
                  className="rounded-full px-3 py-1 font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {MONTHS[m]} {y}
                </button>
                <NavButton label="เดือนถัดไป" onClick={() => setFocus(addMonthsTo(focus, 1))}>
                  <ChevronRight className="size-4" aria-hidden />
                </NavButton>
              </div>
              <div role="grid" aria-label={`${MONTHS[m]} ${y}`} ref={gridRef} onKeyDown={onGridKey}>
                <div role="row" className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground">
                  {WEEKDAYS.map((w) => (
                    <span key={w} role="columnheader" className="py-1">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-0.5">
                  {cells.map((d) => {
                    const here = d.slice(0, 7) === first.slice(0, 7);
                    const selected = d === value;
                    const off = !inRange(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        role="gridcell"
                        data-date={d}
                        tabIndex={d === focus ? 0 : -1}
                        disabled={off}
                        aria-selected={selected}
                        aria-label={formatThaiDate(d)}
                        aria-current={d === today ? "date" : undefined}
                        onClick={() => pick(d)}
                        className={cn(
                          "mx-auto grid size-9 place-items-center rounded-full text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                          selected ? "bg-ink-chip font-medium text-white" : d === today ? "font-semibold ring-1 ring-foreground/30" : "",
                          !selected && !off && "hover:bg-muted",
                          !here && !selected && "text-muted-foreground/60",
                          off && "cursor-not-allowed text-muted-foreground/35 line-through decoration-transparent",
                        )}
                      >
                        {Number(d.slice(8, 10))}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-black/[0.06] pt-2 text-sm">
                <button type="button" disabled={!inRange(today)} onClick={() => pick(today)} className="rounded-full px-3 py-1.5 font-medium text-primary outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-40">
                  วันนี้
                </button>
                {clearable && value && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    className="rounded-full px-3 py-1.5 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    ล้าง
                  </button>
                )}
              </div>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface MonthProps extends CommonProps {
  /** "YYYY-MM". */
  value: string;
  onChange: (value: string) => void;
}

/** Month + year chooser (reports). */
export function MonthPicker({ id, value, onChange, variant = "pill", className, disabled, invalid, describedBy, ...rest }: MonthProps) {
  const [open, setOpen] = useState(false);
  const cur = value ? { y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) - 1 } : null;
  const [year, setYear] = useState(cur?.y ?? Number(todayBangkok().slice(0, 4)));

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setYear(cur?.y ?? Number(todayBangkok().slice(0, 4)));
      }}
    >
      <Popover.Trigger asChild>
        <button id={id} type="button" aria-haspopup="dialog" aria-expanded={open} data-invalid={invalid || undefined} aria-describedby={describedBy} aria-label={rest["aria-label"]} disabled={disabled} className={cn(TRIGGER_BASE, TRIGGER_VARIANT[variant], className)}>
          <span className="min-w-0 flex-1 truncate text-left">{cur ? `${MONTHS[cur.m]} ${cur.y}` : "เลือกเดือน"}</span>
          <CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className={cn(POPOVER_SURFACE, "w-64 p-3")} aria-label="เลือกเดือน">
          <MonthGrid
            year={year}
            month={null}
            current={cur}
            onYear={setYear}
            onPick={(m) => {
              onChange(`${year}-${pad(m + 1)}`);
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
