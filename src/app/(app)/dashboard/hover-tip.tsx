"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

export interface TipOptions {
  /** Called with true while the element is hovered or focused, false after; drives the spotlight on other cards. */
  onSpot?: (on: boolean) => void;
}

interface TipApi {
  /** Props to spread on any HTML/SVG element: shows `content` while the pointer is over it or it has keyboard focus. */
  bind: (content: ReactNode, opts?: TipOptions) => {
    onPointerEnter: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerLeave: () => void;
    onFocus: (e: FocusEvent) => void;
    onBlur: () => void;
  };
}

const TipContext = createContext<TipApi | null>(null);

/** Hover/focus tooltips for the dashboard. Touch pointers are ignored so a tap still just clicks. */
export function TipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null);
  // The spotlight callback of whatever the tip is currently about, so a dismissal can switch it off too.
  const spotRef = useRef<((on: boolean) => void) | null>(null);
  const hide = useCallback(() => setTip(null), []);
  const dismiss = useCallback(() => {
    setTip(null);
    spotRef.current?.(false);
    spotRef.current = null;
  }, []);

  // Leaving by a link never sends a pointer-leave, and Next keeps this page alive for the back button: without this the
  // tip and the map highlight are still there when you return. Also drop them when the tab is hidden or the page unmounts.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest("a[href]")) dismiss();
    };
    const onHidden = () => document.visibilityState === "hidden" && dismiss();
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", dismiss);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", dismiss);
      dismiss();
    };
  }, [dismiss]);

  const api = useMemo<TipApi>(
    () => ({
      bind: (content, opts) => {
        const at = (e: PointerEvent) => {
          // The innermost element that has a tooltip wins; its parents must not overwrite it.
          e.stopPropagation();
          if (e.pointerType !== "touch") setTip({ x: e.clientX, y: e.clientY, content });
        };
        const spot = (on: boolean) => {
          spotRef.current = on ? (opts?.onSpot ?? null) : null;
          opts?.onSpot?.(on);
        };
        return {
          onPointerEnter: (e: PointerEvent) => {
            at(e);
            if (e.pointerType !== "touch") spot(true);
          },
          onPointerMove: at,
          onPointerLeave: () => {
            hide();
            spot(false);
          },
          onFocus: (e: FocusEvent) => {
            const r = (e.currentTarget as Element).getBoundingClientRect();
            setTip({ x: r.left + r.width / 2, y: r.bottom, content });
            spot(true);
          },
          onBlur: () => {
            hide();
            spot(false);
          },
        };
      },
    }),
    [hide],
  );

  return (
    <TipContext.Provider value={api}>
      {children}
      {tip && <TipBox tip={tip} />}
    </TipContext.Provider>
  );
}

export function useTip(): TipApi {
  const ctx = useContext(TipContext);
  if (!ctx) throw new Error("useTip must be used inside <TipProvider>");
  return ctx;
}

const GAP = 14;

function TipBox({ tip }: { tip: TipState }) {
  const ref = useRef<HTMLDivElement>(null);
  // Place beside the pointer; flip to the other side when it would leave the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = tip.x + GAP + width > window.innerWidth - 8 ? tip.x - GAP - width : tip.x + GAP;
    const top = tip.y + GAP + height > window.innerHeight - 8 ? tip.y - GAP - height : tip.y + GAP;
    el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  }, [tip]);

  return (
    <div
      ref={ref}
      role="tooltip"
      className={cn(
        // Liquid glass, same recipe as the cards: translucent white, heavy blur, bright rim, soft inner highlight.
        "pointer-events-none fixed top-0 left-0 z-50 w-max max-w-[18rem] rounded-2xl bg-white/60 py-2.5 pr-4 text-xs leading-relaxed text-foreground backdrop-blur-2xl backdrop-saturate-200",
        "ring-1 ring-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(255,255,255,0.35),0_12px_36px_rgba(10,42,107,0.22)]",
        "pl-4",
      )}
    >
      {tip.content}
    </div>
  );
}

/* Building blocks so every tooltip reads the same. */

export function TipTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-1.5">
      <div className="text-sm font-medium">{children}</div>
      {sub && <div className="text-foreground/60">{sub}</div>}
    </div>
  );
}

export function TipRow({ label, value, dot, tone, hl }: { label: ReactNode; value: ReactNode; dot?: string; tone?: "warn" | "bad"; hl?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 py-px", hl && "-mx-1.5 rounded-md bg-white/70 px-1.5 font-medium shadow-sm shadow-black/5")}>
      {dot && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: dot }} />}
      <span className="text-foreground/70">{label}</span>
      <span className={cn("ml-auto pl-3 font-medium tabular-nums", tone === "bad" && "text-[#b91c1c]", tone === "warn" && "text-amber-700")}>{value}</span>
    </div>
  );
}

export function TipNote({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 border-t border-black/[0.08] pt-1.5 text-foreground/60">{children}</div>;
}
