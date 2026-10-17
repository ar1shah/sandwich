import { describe, expect, it } from "vitest";
import { RecipeSchema } from "../src/shared/recipe";
import {
  clampTrim,
  isAtResetLength,
  moveWindow,
  nudgeEnd,
  nudgeStart,
  nudgeWindow,
  pxToSeconds,
  resetLength,
  resizeEnd,
  resizeStart,
  secondsToPx,
  setDuration,
  setStart,
  snap,
  trimEnd,
  type Trim,
} from "../src/shared/trimMath";
import { emptyRecipe } from "./helpers/recipe";

const SRC = 8;

describe("snap", () => {
  it("rounds to 0.1 and removes float noise", () => {
    expect(snap(0.1 + 0.2)).toBe(0.3);
    expect(snap(1.04)).toBe(1);
    expect(snap(1.06)).toBe(1.1);
    expect(snap(1.05)).toBe(1.1);
    expect(snap(2.675)).toBe(2.7);
  });
});

describe("clampTrim", () => {
  it("keeps a valid trim", () => {
    expect(clampTrim({ start: 1, duration: 3 }, SRC)).toEqual({
      start: 1,
      duration: 3,
    });
  });

  it("pulls the start back so the end stays inside the clip", () => {
    expect(clampTrim({ start: 7, duration: 3 }, SRC)).toEqual({
      start: 5,
      duration: 3,
    });
  });

  it("raises a too-short duration to 0.5 s", () => {
    expect(clampTrim({ start: 1, duration: 0.1 }, SRC).duration).toBe(0.5);
  });

  it("never starts before 0", () => {
    expect(clampTrim({ start: -2, duration: 3 }, SRC).start).toBe(0);
  });

  it("caps the duration at the clip length", () => {
    expect(clampTrim({ start: 2, duration: 20 }, SRC)).toEqual({
      start: 0,
      duration: 8,
    });
  });

  it("uses the whole clip when the clip is shorter than the minimum", () => {
    expect(clampTrim({ start: 0.1, duration: 0.2 }, 0.3)).toEqual({
      start: 0,
      duration: 0.3,
    });
  });
});

describe("moveWindow", () => {
  const origin: Trim = { start: 2, duration: 3 };

  it("moves the start and keeps the length", () => {
    expect(moveWindow(origin, 1.5, SRC)).toEqual({ start: 3.5, duration: 3 });
  });

  it("snaps to 0.1 s", () => {
    expect(moveWindow(origin, 0.54, SRC)).toEqual({ start: 2.5, duration: 3 });
  });

  it("stops at the start of the clip", () => {
    expect(moveWindow(origin, -10, SRC)).toEqual({ start: 0, duration: 3 });
  });

  it("stops at the end of the clip", () => {
    expect(moveWindow(origin, 10, SRC)).toEqual({ start: 5, duration: 3 });
  });

  it("returns the origin for a zero delta, even off the grid", () => {
    const off: Trim = { start: 2.37, duration: 3.04 };
    expect(moveWindow(off, 0, SRC)).toEqual(off);
  });

  it("can end exactly at an off-grid source end", () => {
    const moved = moveWindow({ start: 2, duration: 3 }, 10, 8.37);
    expect(moved).toEqual({ start: 5.37, duration: 3 });
    expect(trimEnd(moved)).toBe(8.37);
  });

  it("many small moves from the origin add up to the full distance", () => {
    // 100 pointermoves of 0.01 s: each alone snaps to nothing, together 1.0 s.
    let current = origin;
    let total = 0;
    for (let i = 0; i < 100; i++) {
      total += 0.01;
      current = moveWindow(origin, total, SRC);
    }
    expect(current).toEqual({ start: 3, duration: 3 });
    // The naive incremental version would not have moved at all.
    let naive = origin;
    for (let i = 0; i < 100; i++) {
      naive = moveWindow(naive, 0.01, SRC);
    }
    expect(naive).toEqual(origin);
  });
});

describe("resizeStart", () => {
  const origin: Trim = { start: 2, duration: 3 };

  it("moves the start and keeps the end fixed", () => {
    expect(resizeStart(origin, 1, SRC)).toEqual({ start: 3, duration: 2 });
    expect(resizeStart(origin, -1, SRC)).toEqual({ start: 1, duration: 4 });
  });

  it("stops at 0", () => {
    expect(resizeStart(origin, -9, SRC)).toEqual({ start: 0, duration: 5 });
  });

  it("keeps the 0.5 s minimum", () => {
    expect(resizeStart(origin, 9, SRC)).toEqual({ start: 4.5, duration: 0.5 });
  });

  it("snaps", () => {
    expect(resizeStart(origin, 0.44, SRC)).toEqual({
      start: 2.4,
      duration: 2.6,
    });
  });

  it("keeps the end exactly when it was off the grid", () => {
    const off: Trim = { start: 5.37, duration: 3 };
    const result = resizeStart(off, -1, 8.37);
    expect(trimEnd(result)).toBe(8.37);
    expect(result.start).toBe(4.4);
  });
});

describe("resizeEnd", () => {
  const origin: Trim = { start: 2, duration: 3 };

  it("changes the duration and keeps the start", () => {
    expect(resizeEnd(origin, 1, SRC)).toEqual({ start: 2, duration: 4 });
    expect(resizeEnd(origin, -1, SRC)).toEqual({ start: 2, duration: 2 });
  });

  it("stops at the end of the clip", () => {
    expect(resizeEnd(origin, 99, SRC)).toEqual({ start: 2, duration: 6 });
  });

  it("keeps the 0.5 s minimum", () => {
    expect(resizeEnd(origin, -99, SRC)).toEqual({ start: 2, duration: 0.5 });
  });

  it("reaches an off-grid source end exactly", () => {
    const result = resizeEnd({ start: 5.2, duration: 3 }, 5, 8.37);
    expect(trimEnd(result)).toBe(8.37);
  });
});

describe("recipe validity", () => {
  it("every result with float noise or an off-grid source still parses", () => {
    const sources = [8, 8.37, 3.2, 45.04, 0.7];
    const results: Array<[number, Trim]> = [];
    for (const source of sources) {
      const base: Trim = clampTrim({ start: 0.1 + 0.2, duration: 3 }, source);
      for (const delta of [-99, -0.07, 0.03, 0.31, 1.234, 99]) {
        results.push([source, moveWindow(base, delta, source)]);
        results.push([source, resizeStart(base, delta, source)]);
        results.push([source, resizeEnd(base, delta, source)]);
      }
      results.push([source, setDuration(base, 0.1 + 0.7, source)]);
      results.push([source, nudgeEnd(base, 1, 0.1, source)]);
    }
    for (const [source, trim] of results) {
      const recipe = emptyRecipe();
      recipe.clips[0] = {
        ...recipe.clips[0],
        mediaPath: "clips/a.mp4",
        sourceDuration: source,
        trimStart: trim.start,
        duration: trim.duration,
      };
      expect(RecipeSchema.safeParse(recipe).success).toBe(true);
    }
  });
});

describe("setStart", () => {
  it("keeps the duration", () => {
    expect(setStart({ start: 1, duration: 3 }, 2.26, SRC)).toEqual({
      start: 2.3,
      duration: 3,
    });
  });

  it("pushes the window back inside the clip", () => {
    expect(setStart({ start: 1, duration: 3 }, 7, SRC)).toEqual({
      start: 5,
      duration: 3,
    });
    expect(setStart({ start: 1, duration: 3 }, -1, SRC).start).toBe(0);
  });
});

describe("setDuration", () => {
  it("keeps the start", () => {
    expect(setDuration({ start: 1, duration: 3 }, 2, SRC)).toEqual({
      start: 1,
      duration: 2,
    });
  });

  it("shifts the start earlier on overflow so the typed length is honored", () => {
    expect(setDuration({ start: 6, duration: 1 }, 4, SRC)).toEqual({
      start: 4,
      duration: 4,
    });
  });

  it("caps at the clip length", () => {
    expect(setDuration({ start: 3, duration: 2 }, 99, SRC)).toEqual({
      start: 0,
      duration: 8,
    });
  });

  it("raises to the minimum", () => {
    expect(setDuration({ start: 3, duration: 2 }, 0, SRC).duration).toBe(0.5);
  });
});

describe("resetLength", () => {
  it("keeps the start and uses the slot default", () => {
    expect(resetLength({ start: 1, duration: 1 }, 3, SRC)).toEqual({
      start: 1,
      duration: 3,
    });
  });

  it("moves the start earlier only when it would overflow", () => {
    expect(resetLength({ start: 7, duration: 1 }, 3, SRC)).toEqual({
      start: 5,
      duration: 3,
    });
  });

  it("uses the whole clip when it is shorter than the default", () => {
    expect(resetLength({ start: 1, duration: 1 }, 5, 3.2)).toEqual({
      start: 0,
      duration: 3.2,
    });
  });

  it("knows when it is already there", () => {
    expect(isAtResetLength({ start: 1, duration: 3 }, 3, SRC)).toBe(true);
    expect(isAtResetLength({ start: 1, duration: 2 }, 3, SRC)).toBe(false);
    expect(isAtResetLength({ start: 0, duration: 3.2 }, 5, 3.2)).toBe(true);
  });
});

describe("nudges", () => {
  const trim: Trim = { start: 2, duration: 3 };

  it("moves the window 0.1 s or 1 s", () => {
    expect(nudgeWindow(trim, 1, 0.1, SRC)).toEqual({ start: 2.1, duration: 3 });
    expect(nudgeWindow(trim, -1, 1, SRC)).toEqual({ start: 1, duration: 3 });
  });

  it("stops at the bounds", () => {
    expect(nudgeWindow({ start: 0, duration: 3 }, -1, 0.1, SRC).start).toBe(0);
    expect(nudgeWindow({ start: 5, duration: 3 }, 1, 1, SRC).start).toBe(5);
  });

  it("moves the start edge and keeps the end", () => {
    expect(nudgeStart(trim, -1, 0.1, SRC)).toEqual({
      start: 1.9,
      duration: 3.1,
    });
    expect(nudgeStart(trim, 1, 0.1, SRC)).toEqual({
      start: 2.1,
      duration: 2.9,
    });
  });

  it("moves the end edge and keeps the start", () => {
    expect(nudgeEnd(trim, 1, 0.1, SRC)).toEqual({ start: 2, duration: 3.1 });
    expect(nudgeEnd(trim, -1, 1, SRC)).toEqual({ start: 2, duration: 2 });
  });

  it("does not shrink below 0.5 s", () => {
    expect(nudgeEnd({ start: 2, duration: 0.5 }, -1, 0.1, SRC).duration).toBe(
      0.5,
    );
    expect(nudgeStart({ start: 2, duration: 0.5 }, 1, 0.1, SRC)).toEqual({
      start: 2,
      duration: 0.5,
    });
  });

  it("steps off-grid values to the grid first", () => {
    // End at 8.37: one step left lands on 8.3, one step right stays put.
    const atEnd: Trim = { start: 5.37, duration: 3 };
    expect(trimEnd(nudgeEnd(atEnd, -1, 0.1, 8.37))).toBe(8.3);
    expect(trimEnd(nudgeEnd(atEnd, 1, 0.1, 8.37))).toBe(8.37);
  });
});

describe("pixels", () => {
  it("converts pointer travel to seconds and back", () => {
    expect(pxToSeconds(50, 200, 8)).toBe(2);
    expect(secondsToPx(2, 200, 8)).toBe(50);
    expect(pxToSeconds(50, 0, 8)).toBe(0);
    expect(secondsToPx(2, 200, 0)).toBe(0);
  });
});
