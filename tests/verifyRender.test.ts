import { describe, expect, it } from "vitest";
import { createEmptyRecipe, type Recipe } from "../src/shared/recipe";
import { msPerOutputSecond } from "../src/shared/renderStats";
import {
  compareColourPatches,
  judgeAudioWindow,
  planAudioWindows,
  planColourClip,
} from "../src/shared/verifyRender";

function filledRecipe(): Recipe {
  const recipe = createEmptyRecipe(
    { id: "p", slug: "p" },
    { clipDurations: { before: 3, after: 4, broll: 5 } },
    { id: "00000000-0000-4000-8000-000000000000", now: new Date(0) },
  );
  return {
    ...recipe,
    clips: recipe.clips.map((clip, index) => ({
      ...clip,
      mediaPath: `clip${index}.mp4`,
      sourceDuration: 10,
      trimStart: index,
    })) as Recipe["clips"],
  };
}

describe("planAudioWindows", () => {
  it("insets each window by 0.1 s on both sides and tracks the trim", () => {
    const windows = planAudioWindows(filledRecipe(), 30);
    expect(windows).toHaveLength(3);
    expect(windows[0]?.outputStart).toBeCloseTo(0.1);
    expect(windows[0]?.outputLength).toBeCloseTo(2.8);
    expect(windows[1]?.outputStart).toBeCloseTo(3.1);
    expect(windows[1]?.outputLength).toBeCloseTo(3.8);
    expect(windows[2]?.outputStart).toBeCloseTo(7.1);
    // trimStart 1 s for the "after" clip
    expect(windows[1]?.sourceStart).toBeCloseTo(1.1);
  });

  it("never returns a negative length", () => {
    const windows = planAudioWindows(filledRecipe(), 30, 10);
    expect(windows.every((w) => w.outputLength === 0)).toBe(true);
  });
});

describe("judgeAudioWindow", () => {
  it("requires muted clips to be silent", () => {
    expect(judgeAudioWindow({ muted: true }, -91, -4).status).toBe("pass");
    expect(judgeAudioWindow({ muted: true }, -4, -4).status).toBe("fail");
  });

  it("fails an unmuted clip that is silent while its source is audible", () => {
    expect(judgeAudioWindow({ muted: false }, -4.4, -4).status).toBe("pass");
    expect(judgeAudioWindow({ muted: false }, -91, -4).status).toBe("fail");
  });

  it("only reports when the source itself is silent or has no measurement", () => {
    expect(judgeAudioWindow({ muted: false }, -91, -91).status).toBe("info");
    expect(
      judgeAudioWindow({ muted: false }, Number.NEGATIVE_INFINITY, null).status,
    ).toBe("info");
  });

  it("fails when the render could not be measured", () => {
    expect(judgeAudioWindow({ muted: true }, null, null).status).toBe("fail");
  });
});

describe("planColourClip", () => {
  it("picks the first clip with no zoom, centred focus and no middle caption", () => {
    const recipe = filledRecipe();
    const [before, after, broll] = recipe.clips;
    const withZoom = { ...before, zoom: "slow-push" as const };
    const captioned = {
      ...after,
      caption: {
        text: "x",
        style: "box" as const,
        position: "middle" as const,
      },
    };
    const plan = planColourClip(
      { clips: [withZoom, captioned, broll] } as Pick<Recipe, "clips">,
      30,
    );
    expect(plan?.slot).toBe("broll");
    // broll starts at 7 s, 5 s long: middle frame is 75 frames in.
    expect(plan?.outputTime).toBeCloseTo(7 + 2.5);
    // trimStart 2 s plus the same 2.5 s
    expect(plan?.sourceTime).toBeCloseTo(2 + 2.5);
  });

  it("returns null when no clip qualifies", () => {
    const recipe = filledRecipe();
    const zoomed = recipe.clips.map((clip) => ({
      ...clip,
      zoom: "punch-in" as const,
    }));
    expect(
      planColourClip({ clips: zoomed } as unknown as Pick<Recipe, "clips">, 30),
    ).toBeNull();
  });

  it("skips an off-centre focus", () => {
    const recipe = filledRecipe();
    const off = recipe.clips.map((clip) => ({
      ...clip,
      focus: { x: 0.3, y: 0.5 },
    }));
    expect(
      planColourClip({ clips: off } as unknown as Pick<Recipe, "clips">, 30),
    ).toBeNull();
  });
});

describe("compareColourPatches", () => {
  const base = { y: 100, r: 120, g: 100, b: 80 };
  it("passes within tolerance and fails beyond it", () => {
    expect(compareColourPatches(base, { ...base, r: 124 }).ok).toBe(true);
    const shifted = compareColourPatches(base, { ...base, b: 95 });
    expect(shifted.ok).toBe(false);
    expect(shifted.maxDiff).toBe(15);
  });
});

describe("msPerOutputSecond", () => {
  it("divides render time by output seconds", () => {
    expect(msPerOutputSecond(12_000, 360, 30)).toBe(1000);
    expect(msPerOutputSecond(5, 0, 30)).toBe(0);
  });
});
