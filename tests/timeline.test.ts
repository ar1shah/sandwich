import { describe, expect, it } from "vitest";
import {
  createEmptyRecipe,
  totalDuration,
  type Recipe,
} from "../src/shared/recipe";
import { buildTimeline } from "../src/shared/timeline";

const FPS = 30;

function recipeWith(
  durations: [number, number, number],
  overrides: Partial<Recipe["clips"][number]>[] = [],
): Recipe {
  const recipe = createEmptyRecipe(
    { id: "p", slug: "p" },
    { clipDurations: { before: 3, after: 4, broll: 5 } },
    { id: "00000000-0000-4000-8000-000000000001", now: new Date(0) },
  );
  recipe.clips.forEach((clip, index) => {
    clip.mediaPath = `clip${index}.mp4`;
    clip.sourceDuration = 20;
    clip.duration = durations[index] ?? clip.duration;
    Object.assign(clip, overrides[index]);
  });
  return recipe;
}

describe("buildTimeline", () => {
  it("lays out 3 / 4 / 5 s back to back at 30 fps", () => {
    const timeline = buildTimeline(recipeWith([3, 4, 5]), FPS);
    expect(
      timeline.clips.map((c) => [c.slot, c.from, c.durationInFrames]),
    ).toEqual([
      ["before", 0, 90],
      ["after", 90, 120],
      ["broll", 210, 150],
    ]);
    expect(timeline.totalFrames).toBe(360);
  });

  it("converts trimStart to source frames", () => {
    const timeline = buildTimeline(
      recipeWith(
        [3, 4, 5],
        [{ trimStart: 1 }, { trimStart: 0.5 }, { trimStart: 2 }],
      ),
      FPS,
    );
    expect(timeline.clips.map((c) => c.trimBeforeFrames)).toEqual([30, 15, 60]);
  });

  it("always sums the clip frames to totalFrames, and to round(total * fps) on a 0.1 s grid", () => {
    for (let a = 1; a <= 60; a += 1) {
      for (let b = 1; b <= 60; b += 7) {
        for (let c = 1; c <= 60; c += 11) {
          const recipe = recipeWith([a / 10, b / 10, c / 10]);
          const timeline = buildTimeline(recipe, FPS);
          const sum = timeline.clips.reduce(
            (s, clip) => s + clip.durationInFrames,
            0,
          );
          expect(timeline.totalFrames).toBe(sum);
          expect(timeline.totalFrames).toBe(
            Math.round(totalDuration(recipe) * FPS),
          );
        }
      }
    }
  });

  it("makes clips contiguous with no gaps or overlaps", () => {
    const timeline = buildTimeline(recipeWith([3.3, 4.4, 5.5]), FPS);
    let expectedFrom = 0;
    for (const clip of timeline.clips) {
      expect(clip.from).toBe(expectedFrom);
      expectedFrom += clip.durationInFrames;
    }
    expect(timeline.totalFrames).toBe(396);
  });

  it("does not drift when every duration rounds the same way", () => {
    // 0.05 s is 1.5 frames: independent rounding would give 2 + 2 + 2 = 6, not round(4.5).
    const timeline = buildTimeline(recipeWith([0.05, 0.05, 0.05]), FPS);
    expect(timeline.totalFrames).toBe(Math.round(0.15 * FPS));
  });

  it("gives a clip shorter than half a frame one frame, and later boundaries absorb the error", () => {
    const timeline = buildTimeline(recipeWith([3, 0.01, 5]), FPS);
    expect(timeline.clips[1]?.durationInFrames).toBe(1);
    expect(timeline.clips.every((c) => c.durationInFrames >= 1)).toBe(true);
    // 8.01 s * 30 = 240.3 -> 240: the 1 frame floor on the middle clip is re-absorbed.
    expect(timeline.totalFrames).toBe(240);
  });

  it("lets the 1 frame floor win over exact rounding, growing the total", () => {
    const recipe = recipeWith([0.01, 0.01, 0.01]);
    const timeline = buildTimeline(recipe, FPS);
    expect(timeline.clips.map((c) => c.durationInFrames)).toEqual([1, 1, 1]);
    const sum = timeline.clips.reduce(
      (s, clip) => s + clip.durationInFrames,
      0,
    );
    expect(timeline.totalFrames).toBe(sum);
    expect(timeline.totalFrames).toBe(3);
    expect(Math.round(totalDuration(recipe) * FPS)).toBe(1);
  });

  it("keeps trimStart + duration == sourceDuration inside the source", () => {
    const timeline = buildTimeline(
      recipeWith([3, 4, 5], [{ sourceDuration: 8, trimStart: 5 }]),
      FPS,
    );
    const before = timeline.clips[0];
    expect(before?.trimBeforeFrames).toBe(150);
    expect(
      (before?.trimBeforeFrames ?? 0) + (before?.durationInFrames ?? 0),
    ).toBe(240);
  });

  it("clamps the trim so rounding cannot read past the end of the source", () => {
    // 0.05 s * 30 = 1.5 frames of trim would round up and push the window past the end.
    const timeline = buildTimeline(
      recipeWith([1, 4, 5], [{ sourceDuration: 1.05, trimStart: 0.05 }]),
      FPS,
    );
    const before = timeline.clips[0];
    expect(before?.durationInFrames).toBe(30);
    expect(before?.trimBeforeFrames).toBe(1);
    expect(
      (before?.trimBeforeFrames ?? 0) + (before?.durationInFrames ?? 0),
    ).toBeLessThanOrEqual(Math.floor(1.05 * FPS));
  });

  it("never returns a negative trim when the source is shorter than the window", () => {
    const timeline = buildTimeline(
      recipeWith([3, 4, 5], [{ sourceDuration: 1, trimStart: 0.5 }]),
      FPS,
    );
    expect(timeline.clips[0]?.trimBeforeFrames).toBe(0);
  });

  it("uses trim 0 for an empty slot but still gives it its duration", () => {
    const recipe = recipeWith([3, 4, 5]);
    const broll = recipe.clips[2];
    broll.mediaPath = "";
    broll.trimStart = 2;
    const timeline = buildTimeline(recipe, FPS);
    expect(timeline.clips[2]).toMatchObject({
      from: 210,
      durationInFrames: 150,
      trimBeforeFrames: 0,
    });
  });
});
