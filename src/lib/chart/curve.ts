export interface Pt {
  x: number;
  y: number;
}

/** Tangents of the monotone cubic (Fritsch–Carlson): steepness at each point that never overshoots its neighbours. */
function tangents(pts: readonly Pt[]): { dx: number[]; m: number[] } {
  const n = pts.length;
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const slope = pts.slice(1).map((p, i) => (p.y - pts[i].y) / (dx[i] || 1));
  const m = new Array<number>(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  // Limit the tangents so each segment stays monotone.
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      m[i] = (3 * a * slope[i]) / h;
      m[i + 1] = (3 * b * slope[i]) / h;
    }
  }
  return { dx, m };
}

/**
 * Smooth line through the points that never overshoots them (monotone cubic). A plain spline would dip below zero
 * between two zero months; this one stays flat.
 */
export function monotonePath(pts: readonly Pt[]): string {
  const n = pts.length;
  if (n === 0) return "";
  const f = (v: number) => Number(v.toFixed(2));
  if (n === 1) return `M${f(pts[0].x)},${f(pts[0].y)}`;
  const { dx, m } = tangents(pts);
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const w = dx[i] / 3;
    d += `C${f(pts[i].x + w)},${f(pts[i].y + m[i] * w)} ${f(pts[i + 1].x - w)},${f(pts[i + 1].y - m[i + 1] * w)} ${f(pts[i + 1].x)},${f(pts[i + 1].y)}`;
  }
  return d;
}

/** Height of the same curve at any x, so a marker can ride along the line instead of jumping from point to point. */
export function monotoneY(pts: readonly Pt[], x: number): number {
  const n = pts.length;
  if (n === 0) return 0;
  if (n === 1 || x <= pts[0].x) return pts[0].y;
  if (x >= pts[n - 1].x) return pts[n - 1].y;
  const { dx, m } = tangents(pts);
  let i = 0;
  while (i < n - 2 && x > pts[i + 1].x) i++;
  const h = dx[i];
  const t = (x - pts[i].x) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  // Cubic Hermite basis; the path above places its control points a third of the way across, so x is linear in t.
  return (2 * t3 - 3 * t2 + 1) * pts[i].y + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * pts[i + 1].y + (t3 - t2) * h * m[i + 1];
}

/** Top of a count axis and its gridline values: a round number at or above `max`, split in 4 (or fewer for small counts). */
export function countAxis(max: number): { top: number; ticks: number[] } {
  const m = Math.max(1, Math.ceil(max));
  if (m <= 4) return { top: m, ticks: Array.from({ length: m + 1 }, (_, i) => i) };
  const raw = m / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(m / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { top, ticks };
}
