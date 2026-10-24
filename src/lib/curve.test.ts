import { describe, expect, it } from "vitest";
import { areaPath, monotonePath } from "./curve";

/** Samples a cubic bezier segment's y at t. */
function bezierY(y0: number, y1: number, y2: number, y3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
}

describe("activity curve", () => {
  it("handles empty and single points", () => {
    expect(monotonePath([])).toBe("");
    expect(monotonePath([{ x: 3, y: 4 }])).toBe("M3 4");
    expect(areaPath([{ x: 3, y: 4 }], "M3 4", 10)).toBe("");
  });

  it("passes through every point", () => {
    const pts = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ];
    const d = monotonePath(pts);
    expect(d.startsWith("M0 10")).toBe(true);
    expect(d.endsWith(" 30 10")).toBe(true);
    expect((d.match(/ C/g) ?? []).length).toBe(3);
  });

  it("never overshoots: a zero week between busy weeks stays on the baseline", () => {
    // y grows downward in SVG: 100 is the baseline (zero saves).
    const pts = [
      { x: 0, y: 20 },
      { x: 10, y: 100 },
      { x: 20, y: 20 },
    ];
    const d = monotonePath(pts);
    const nums = d.replace(/[MC]/g, " ").trim().split(/\s+/).map(Number);
    // Segment 1: control points between (0,20) and (10,100).
    const [, y0, , y1, , y2, , y3] = nums;
    for (let t = 0; t <= 1; t += 0.1) {
      const y = bezierY(y0, y1, y2, y3, t);
      expect(y).toBeLessThanOrEqual(100.0001);
      expect(y).toBeGreaterThanOrEqual(19.9999);
    }
  });

  it("closes the area down to the baseline", () => {
    const pts = [
      { x: 0, y: 5 },
      { x: 10, y: 7 },
    ];
    expect(areaPath(pts, monotonePath(pts), 50)).toMatch(/ L10 50 L0 50 Z$/);
  });
});
