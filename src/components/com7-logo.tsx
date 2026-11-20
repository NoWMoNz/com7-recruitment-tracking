import { cn } from "@/lib/utils";

/*
 * Geometry traced from the official COM7_Logo.svg.webp (2000 x 707 canvas).
 * The "7" is a cut-out of the green diamond, so it shows whatever is behind the logo.
 */
const DIAMOND = { cx: 1646, cy: 353, side: 559, r: 100 };
const SEVEN = "1470,128 1932,128 1635,760 1454,760 1688,270 1470,270";

// Identical definition wherever it appears, so a fixed id is safe even when several logos share a page.
const MASK_ID = "com7-seven-cutout";

function Diamond() {
  const { cx, cy, side, r } = DIAMOND;
  return (
    <>
      <mask id={MASK_ID} maskUnits="userSpaceOnUse" x="1280" y="-10" width="740" height="730">
        <rect x="1280" y="-10" width="740" height="730" fill="#fff" />
        <polygon points={SEVEN} fill="#000" />
      </mask>
      <g mask={`url(#${MASK_ID})`}>
        <rect
          x={cx - side / 2}
          y={cy - side / 2}
          width={side}
          height={side}
          rx={r}
          transform={`rotate(45 ${cx} ${cy})`}
          fill="var(--brand-green)"
        />
      </g>
    </>
  );
}

/** Com7 wordmark as inline SVG, crisp at any size. */
export function Com7Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 2000 707" role="img" aria-label="Com7" className={cn("h-8 w-auto", className)}>
      <g fill="var(--brand-grey)">
        <path d="M402 340H318.7A125 125 0 1 0 317 447H402.5A205 205 0 1 1 402 340Z" />
        <path
          fillRule="evenodd"
          d="M632 187A205 205 0 1 0 632 597A205 205 0 1 0 632 187ZM632 267A125 125 0 1 1 632 517A125 125 0 1 1 632 267Z"
        />
        <path d="M869 597V228A40 40 0 0 1 909 188H949V597Z" />
        <rect x="1000" y="188" width="80" height="409" />
        <path d="M1131 597V188H1171A40 40 0 0 1 1211 228V597Z" />
      </g>
      <Diamond />
    </svg>
  );
}

/** Just the green "7" diamond, for favicons and small marks. */
export function Com7Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="1292 0 708 707" role="img" aria-label="Com7" className={cn("size-8", className)}>
      <Diamond />
    </svg>
  );
}
