// A smooth SVG path through points, for the Dashboard's activity curve.
// Monotone cubic (Fritsch–Carlson) rather than Catmull-Rom: a curve through
// counts must never dip below a point it passes, so a quiet week between two
// busy ones stays at zero instead of bouncing under the baseline.

export interface Point {
  x: number;
  y: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The "M … C …" path through `points` (sorted by x). One point gives a dot-sized "M x y". */
export function monotonePath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${round(points[0].x)} ${round(points[0].y)}`;
  const n = points.length;
  const dx = Array.from({ length: n - 1 }, (_, i) => points[i + 1].x - points[i].x);
  const slope = Array.from({ length: n - 1 }, (_, i) => (points[i + 1].y - points[i].y) / (dx[i] || 1));
  // Tangent at each point: the harmonic mean of the neighbouring slopes, zero
  // at a local extreme (that's what keeps the curve inside the data).
  const m = new Array<number>(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }
  let d = `M${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const h = dx[i] / 3;
    d += ` C${round(p0.x + h)} ${round(p0.y + m[i] * h)} ${round(p1.x - h)} ${round(p1.y - m[i + 1] * h)} ${round(p1.x)} ${round(p1.y)}`;
  }
  return d;
}

/** The closed path under `linePath`, down to `baseline`, for an area wash. */
export function areaPath(points: Point[], linePath: string, baseline: number): string {
  if (points.length < 2) return "";
  const last = points[points.length - 1];
  const first = points[0];
  return `${linePath} L${round(last.x)} ${round(baseline)} L${round(first.x)} ${round(baseline)} Z`;
}
