import { describe, expect, it } from "vitest";
import { SAFE_ZONE, safeRect } from "../src/shared/safeZone";

describe("safeRect", () => {
  it("matches the SPEC fractions for 1080x1920", () => {
    expect(SAFE_ZONE).toEqual({
      top: 0.08,
      bottom: 0.22,
      left: 0.06,
      right: 0.16,
    });
    // left 64.8 -> 65, right 907.2 -> 907, top 153.6 -> 154, bottom 1497.6 -> 1498
    expect(safeRect()).toEqual({ x: 65, y: 154, width: 842, height: 1344 });
  });

  it("derives size from rounded edges so edges are exact pixels", () => {
    const r = safeRect();
    expect(r.x + r.width).toBe(Math.round(1080 * (1 - SAFE_ZONE.right)));
    expect(r.y + r.height).toBe(Math.round(1920 * (1 - SAFE_ZONE.bottom)));
  });

  it("stays inside the frame for other sizes", () => {
    const r = safeRect(720, 1280);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(720);
    expect(r.y + r.height).toBeLessThanOrEqual(1280);
  });
});
