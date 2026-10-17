import { describe, expect, it } from "vitest";
import {
  lengthStatus,
  slotBreakdown,
  totalSeconds,
} from "../src/shared/lengthStatus";
import { createEmptyRecipe, type Recipe } from "../src/shared/recipe";

const RANGE = { min: 11, max: 15 };

function recipeWith(durations: [number, number, number]): Recipe {
  const recipe = createEmptyRecipe(
    { id: "p", slug: "p" },
    { clipDurations: { before: 3, after: 4, broll: 5 } },
    { id: "00000000-0000-4000-8000-000000000002", now: new Date(0) },
  );
  recipe.clips.forEach((clip, index) => {
    clip.duration = durations[index] ?? clip.duration;
  });
  return recipe;
}

describe("lengthStatus", () => {
  it("is in range at exactly the minimum and the maximum", () => {
    expect(lengthStatus(11, RANGE)).toEqual({ state: "in-range", gap: 0 });
    expect(lengthStatus(15, RANGE)).toEqual({ state: "in-range", gap: 0 });
  });

  it("is short below the minimum, with the gap", () => {
    const status = lengthStatus(9.8, RANGE);
    expect(status.state).toBe("short");
    expect(status.gap).toBeCloseTo(1.2, 9);
  });

  it("is long above the maximum, with the gap", () => {
    const status = lengthStatus(15.8, RANGE);
    expect(status.state).toBe("long");
    expect(status.gap).toBeCloseTo(0.8, 9);
  });

  it("treats one frame short of the minimum as short", () => {
    expect(lengthStatus(329 / 30, RANGE).state).toBe("short");
  });

  it("ignores float noise at the edges", () => {
    expect(lengthStatus(11 - 1e-9, RANGE).state).toBe("in-range");
    expect(lengthStatus(15 + 1e-9, RANGE).state).toBe("in-range");
  });
});

describe("totalSeconds", () => {
  it("is the frame total over fps, not a float sum", () => {
    // 3.1 + 4.1 + 3.8 is 10.999999999999998 as floats; the render has 330 frames.
    const recipe = recipeWith([3.1, 4.1, 3.8]);
    expect(totalSeconds(recipe, 30)).toBe(11);
    expect(lengthStatus(totalSeconds(recipe, 30), RANGE).state).toBe(
      "in-range",
    );
  });

  it("matches the default 3 / 4 / 5 s draft", () => {
    expect(totalSeconds(recipeWith([3, 4, 5]), 30)).toBe(12);
  });

  it("counts empty slots at their duration", () => {
    expect(
      totalSeconds(
        createEmptyRecipe(
          { id: "p", slug: "p" },
          { clipDurations: { before: 3, after: 4, broll: 5 } },
          { id: "00000000-0000-4000-8000-000000000003", now: new Date(0) },
        ),
        30,
      ),
    ).toBe(12);
  });
});

describe("slotBreakdown", () => {
  it("lists each slot's duration", () => {
    expect(slotBreakdown(recipeWith([3.2, 4, 5.5]))).toEqual({
      before: 3.2,
      after: 4,
      broll: 5.5,
    });
  });
});
