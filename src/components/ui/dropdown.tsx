"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: string;
  /** Smaller second line, e.g. a code or an email. */
  hint?: string;
}

export const TRIGGER_BASE =
  "flex w-full items-center justify-between gap-2 border border-input bg-white text-sm outline-none transition-colors hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[invalid=true]:border-destructive data-[state=open]:border-ring data-[state=open]:ring-3 data-[state=open]:ring-ring/30";
/** `pill` = toolbar filters, `field` = form fields. */
export const TRIGGER_VARIANT = { pill: "h-10 rounded-full px-3.5", field: "h-10 rounded-xl px-3" } as const;

export const POPOVER_SURFACE =
  "z-[70] rounded-2xl bg-white p-1.5 text-sm shadow-[0_12px_40px_rgba(0,0,0,0.16)] ring-1 ring-black/5 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0";

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  /** Adds a first option with value "" (e.g. "ทุกภาค"); the trigger shows it as a normal value. */
  emptyLabel?: string;
  /** Search box; on by default for long lists. */
  searchable?: boolean;
  variant?: keyof typeof TRIGGER_VARIANT;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  "aria-label"?: string;
  searchPlaceholder?: string;
}

/**
 * Styled replacement for <select>: a button that opens a listbox popover, with optional search.
 * Keyboard: Enter/Space/↓ opens, ↑↓ Home End move, Enter picks, Esc closes.
 */
export function Dropdown({
  id,
  value,
  onChange,
  options,
  placeholder = "เลือก",
  emptyLabel,
  searchable,
  variant = "field",
  className,
  disabled,
  invalid,
  describedBy,
  searchPlaceholder = "ค้นหา…",
  ...rest
}: Props) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => (emptyLabel !== undefined ? [{ value: "", label: emptyLabel }, ...options] : options), [emptyLabel, options]);
  const showSearch = searchable ?? options.length > 7;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : items;
  }, [items, query]);
  const selected = items.find((o) => o.value === value);

  const openChanged = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setActive(Math.max(0, items.findIndex((o) => o.value === value)));
    }
  };

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (o: DropdownOption | undefined) => {
    if (!o) return;
    onChange(o.value);
    setOpen(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const last = filtered.length - 1;
    if (e.key === "ArrowDown") setActive((i) => Math.min(last, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Home" && !showSearch) setActive(0);
    else if (e.key === "End" && !showSearch) setActive(last);
    else if (e.key === "Enter") pick(filtered[active]);
    else return;
    e.preventDefault();
  };

  return (
    <Popover.Root open={open} onOpenChange={openChanged}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? `${uid}-list` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-label={rest["aria-label"]}
          disabled={disabled}
          onKeyDown={(e) => {
            if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              openChanged(true);
            }
          }}
          className={cn(TRIGGER_BASE, TRIGGER_VARIANT[variant], className)}
        >
          <span className={cn("min-w-0 flex-1 truncate text-left", !selected && "text-muted-foreground")}>{selected ? selected.label : placeholder}</span>
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => {
            if (!showSearch) {
              e.preventDefault();
              listRef.current?.focus();
            }
          }}
          className={cn(POPOVER_SURFACE, "w-max min-w-(--radix-popover-trigger-width) max-w-[min(26rem,calc(100vw-1.5rem))]")}
        >
          {showSearch && (
            <div className="relative mb-1.5">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                aria-label="ค้นหาตัวเลือก"
                role="combobox"
                aria-expanded
                aria-controls={`${uid}-list`}
                aria-activedescendant={filtered[active] ? `${uid}-o${active}` : undefined}
                className="h-9 w-full rounded-xl bg-muted/70 pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
          )}
          <div
            ref={listRef}
            id={`${uid}-list`}
            role="listbox"
            tabIndex={-1}
            aria-label={rest["aria-label"]}
            aria-activedescendant={!showSearch && filtered[active] ? `${uid}-o${active}` : undefined}
            onKeyDown={showSearch ? undefined : onKeyDown}
            className="max-h-64 overflow-y-auto outline-none"
          >
            {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">ไม่พบตัวเลือก</p>}
            {filtered.map((o, i) => (
              <div
                key={o.value || "__empty"}
                id={`${uid}-o${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                onMouseMove={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={cn("flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2", i === active && "bg-muted", o.value === value && "font-medium")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs font-normal text-muted-foreground">{o.hint}</span>}
                </span>
                {o.value === value && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
