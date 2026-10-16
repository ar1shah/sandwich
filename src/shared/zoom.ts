import type { ZoomStyle } from "./recipe";

// Zoom curves for <ClipLayer> (docs/reference/SPEC.md section 3, BUILD_PROMPTS step 1.4).
// Pure and free of any remotion import so the numbers are unit tested.

export const SLOW_PUSH_END_SCALE = 1.12;
export const PUNCH_IN_END_SCALE = 1.25;
export const PUNCH_IN_SECONDS = 0.25;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - clamp01(t)) ** 3;
}

// localFrame is the frame inside the clip's <Sequence> (0 is the first frame).
export function zoomScale(
  style: ZoomStyle,
  localFrame: number,
  durationInFrames: number,
  fps: number,
): number {
  switch (style) {
    case "none":
      return 1;
    case "slow-push": {
      // Progress runs over d-1 steps so the last frame is exactly the end scale.
      const progress = localFrame / Math.max(1, durationInFrames - 1);
      return 1 + (SLOW_PUSH_END_SCALE - 1) * easeInOutCubic(progress);
    }
    case "punch-in": {
      const punchFrames = Math.max(1, Math.round(PUNCH_IN_SECONDS * fps));
      return (
        1 + (PUNCH_IN_END_SCALE - 1) * easeOutCubic(localFrame / punchFrames)
      );
    }
  }
}
