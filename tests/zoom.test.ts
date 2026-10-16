import { describe, expect, it } from "vitest";
import {
  easeInOutCubic,
  easeOutCubic,
  PUNCH_IN_END_SCALE,
  SLOW_PUSH_END_SCALE,
  zoomScale,
} from "../src/shared/zoom";

describe("easing", () => {
  it("hits 0, 0.5 and 1 and clamps outside 0..1", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(-3)).toBe(0);
    expect(easeInOutCubic(7)).toBe(1);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
  });

  it("is monotonic", () => {
    let inOut = 0;
    let out = 0;
    for (let i = 0; i <= 100; i += 1) {
      expect(easeInOutCubic(i / 100)).toBeGreaterThanOrEqual(inOut);
      expect(easeOutCubic(i / 100)).toBeGreaterThanOrEqual(out);
      inOut = easeInOutCubic(i / 100);
      out = easeOutCubic(i / 100);
    }
  });
});

describe("zoomScale", () => {
  it("none is always 1", () => {
    expect(zoomScale("none", 0, 90, 30)).toBe(1);
    expect(zoomScale("none", 89, 90, 30)).toBe(1);
  });

  it("slow-push goes 1.0 to exactly 1.12 on the last frame", () => {
    expect(zoomScale("slow-push", 0, 90, 30)).toBe(1);
    expect(zoomScale("slow-push", 89, 90, 30)).toBeCloseTo(
      SLOW_PUSH_END_SCALE,
      12,
    );
    expect(zoomScale("slow-push", 44.5, 90, 30)).toBeCloseTo(1.06, 6);
  });

  it("slow-push never decreases and eases in and out", () => {
    let previous = 0;
    const steps: number[] = [];
    for (let frame = 0; frame < 90; frame += 1) {
      const scale = zoomScale("slow-push", frame, 90, 30);
      expect(scale).toBeGreaterThanOrEqual(previous);
      steps.push(scale - previous);
      previous = scale;
    }
    // Slow at the ends, fastest in the middle.
    expect(steps[1] ?? 0).toBeLessThan(steps[45] ?? 0);
    expect(steps[89] ?? 0).toBeLessThan(steps[45] ?? 0);
  });

  it("slow-push on a 1 frame clip does not divide by zero", () => {
    expect(zoomScale("slow-push", 0, 1, 30)).toBe(1);
  });

  it("punch-in reaches 1.25 after 0.25 s (8 frames at 30 fps) and then holds", () => {
    expect(zoomScale("punch-in", 0, 120, 30)).toBe(1);
    expect(zoomScale("punch-in", 8, 120, 30)).toBeCloseTo(
      PUNCH_IN_END_SCALE,
      12,
    );
    expect(zoomScale("punch-in", 60, 120, 30)).toBeCloseTo(
      PUNCH_IN_END_SCALE,
      12,
    );
    expect(zoomScale("punch-in", 119, 120, 30)).toBeCloseTo(
      PUNCH_IN_END_SCALE,
      12,
    );
  });

  it("punch-in eases out: most of the move happens early", () => {
    const early = zoomScale("punch-in", 2, 120, 30) - 1;
    const total = PUNCH_IN_END_SCALE - 1;
    expect(early / total).toBeGreaterThan(0.5);
  });
});
