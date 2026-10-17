import { SLOTS, type Recipe, type Slot } from "./recipe";
import { buildTimeline } from "./timeline";

// Total-length indicator for the editor (SPEC section 1, 5.1 step 5). The total is the
// frame count the render will produce divided by fps, so the number on screen is the
// length of the exported file, not a float sum of the clip durations.

export type LengthState = "in-range" | "short" | "long";

export type LengthStatus = {
  state: LengthState;
  // Seconds outside the range; 0 when inside it.
  gap: number;
};

export type TargetRange = { min: number; max: number };

// Totals are whole frames, so one frame short (10.97 s against an 11 s minimum) is real and
// reads as short. This only absorbs float noise such as 330 / 30 not being exactly 11.
const RANGE_SLACK = 1e-6;

export function totalSeconds(
  recipe: Pick<Recipe, "clips">,
  fps: number,
): number {
  return buildTimeline(recipe, fps).totalFrames / fps;
}

export function lengthStatus(total: number, range: TargetRange): LengthStatus {
  if (total < range.min - RANGE_SLACK) {
    return { state: "short", gap: range.min - total };
  }
  if (total > range.max + RANGE_SLACK) {
    return { state: "long", gap: total - range.max };
  }
  return { state: "in-range", gap: 0 };
}

// Clip lengths in slot order, for "3.0s + 4.0s + 5.0s".
export function slotBreakdown(
  recipe: Pick<Recipe, "clips">,
): Record<Slot, number> {
  const result = { before: 0, after: 0, broll: 0 };
  for (const slot of SLOTS) {
    const clip = recipe.clips.find((item) => item.slot === slot);
    result[slot] = clip?.duration ?? 0;
  }
  return result;
}
