"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MAP_SIZE, PROVINCE_PATHS } from "@/lib/geo/thailand-paths";
import { useTip } from "./hover-tip";

interface Props {
  /** Open vacancy per province (map names). Provinces not listed are drawn as inactive. */
  counts: ReadonlyMap<string, number>;
  selected: string | null;
  onSelect: (province: string | null) => void;
  /** Hover tooltip content for a province. */
  describe: (province: string) => ReactNode;
  /** Provinces another card is pointing at (a region, a TA, an aging band). Everything else steps back. */
  highlight: ReadonlySet<string> | null;
  /** Called with the province under the pointer, null when it leaves. */
  onHover?: (province: string | null) => void;
}

const GREEN = "#1f9d55";

/** Longest side of each province in map units (paths are absolute M/L/Z, so the numbers alternate x, y). */
const SPAN = new Map(
  PROVINCE_PATHS.map(({ name, d }) => {
    const v = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const xs = v.filter((_, i) => i % 2 === 0);
    const ys = v.filter((_, i) => i % 2 === 1);
    return [name, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))] as const;
  }),
);
/** How far a hovered province swells: small ones a lot, big ones only a little, so none swallows its neighbours. */
const swellOf = (name: string) => Math.min(2, Math.max(1.12, 46 / (SPAN.get(name) ?? 46)));
const FADE_MS = 240;

/**
 * Province map of Thailand. Provinces with vacancies are filled by count and can be clicked. The province under the
 * pointer swells and floats above its neighbours; when another card highlights a set of provinces, the rest dim.
 */
export function ThailandMap({ counts, selected, onSelect, describe, highlight, onHover }: Props) {
  const { bind } = useTip();
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(1, ...counts.values());

  // What is lit: the hovered province alone, else whatever another card highlights.
  const lit: ReadonlySet<string> | null = hovered ? new Set([hovered]) : highlight && highlight.size > 0 ? highlight : null;
  // Copies stay mounted a moment after they stop being lit so they shrink and fade instead of vanishing.
  const litKey = lit ? [...lit].join("|") : "";
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  if (lit && [...lit].some((n) => !shown.has(n))) setShown(new Set([...shown, ...lit]));
  useEffect(() => {
    const keep = litKey ? new Set(litKey.split("|")) : new Set<string>();
    const t = setTimeout(() => setShown((prev) => (prev.size === [...prev].filter((n) => keep.has(n)).length ? prev : new Set([...prev].filter((n) => keep.has(n))))), FADE_MS + 40);
    return () => clearTimeout(t);
  }, [litKey]);
  const fillOf = (name: string) => {
    const n = counts.get(name) ?? 0;
    return { n, fill: selected === name ? "#1c231e" : n > 0 ? GREEN : "rgba(0,0,0,0.07)", opacity: selected === name || n === 0 ? 1 : 0.3 + 0.7 * (n / max) };
  };

  return (
    <svg viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`} className="mx-auto h-auto max-h-[24rem] w-full overflow-visible" role="group" aria-label="แผนที่ประเทศไทย เลือกจังหวัด">
      {PROVINCE_PATHS.map(({ name, d }) => {
        const { n, fill, opacity } = fillOf(name);
        const active = n > 0;
        const isSelected = selected === name;
        const toggle = () => onSelect(isSelected ? null : name);
        const dim = lit !== null && !lit.has(name);
        return (
          <path
            key={name}
            d={d}
            fill={fill}
            fillOpacity={opacity}
            stroke="#fff"
            strokeWidth={isSelected ? 1.5 : 0.7}
            strokeLinejoin="round"
            style={{ opacity: dim ? 0.22 : 1, transition: "opacity 200ms" }}
            className={active ? "cursor-pointer outline-none focus-visible:stroke-[#1c231e] focus-visible:stroke-2" : undefined}
            {...bind(describe(name), {
              onSpot: (on) => {
                // Only a province with vacancies swells; an empty one just shows its tooltip.
                setHovered((h) => (on ? (active ? name : h) : h === name ? null : h));
                // Only provinces with vacancies have something to summarise.
                if (active) onHover?.(on ? name : null);
              },
            })}
            {...(active
              ? {
                  role: "button",
                  tabIndex: 0,
                  "aria-pressed": isSelected,
                  "aria-label": `${name} ${n} ตำแหน่ง`,
                  onClick: toggle,
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle();
                    }
                  },
                }
              : {})}
          />
        );
      })}

      {/* Lit provinces are redrawn on top as inert copies, so the real paths keep their DOM order and pointer state. */}
      {PROVINCE_PATHS.filter(({ name }) => shown.has(name)).map(({ name, d }) => {
        const { fill, opacity } = fillOf(name);
        const on = lit?.has(name) ?? false;
        const single = hovered === name;
        return (
          <path
            key={name}
            d={d}
            fill={fill}
            fillOpacity={Math.max(opacity, 0.55)}
            stroke="#fff"
            strokeWidth={single ? 2.2 : 1.6}
            strokeLinejoin="round"
            pointerEvents="none"
            className="map-pop"
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              transform: on ? `scale(${single ? swellOf(name) : 1.04})` : "scale(1)",
              opacity: on ? 1 : 0,
              // Only the one under the pointer casts a shadow; a whole region of overlapping shadows looks like a smudge.
              filter: on && single ? "drop-shadow(0 6px 8px rgba(0,0,0,0.35))" : "none",
              transition: `transform ${FADE_MS}ms ease-out, opacity ${FADE_MS}ms ease-out`,
            }}
          />
        );
      })}
    </svg>
  );
}
