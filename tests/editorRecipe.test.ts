import { describe, expect, it } from "vitest";
import {
  applyCaptionLook,
  applyCaptionPick,
  applyCaptionText,
  applyClipMedia,
  applyMuted,
  applySourceCaption,
  applyTrim,
  applyZoom,
  clearCaption,
  clearClip,
  defaultCaptionLook,
  draftHasMedia,
  filledSlots,
  isZoomOn,
  slotStatus,
} from "../src/shared/editorRecipe";
import { DEFAULT_CLIP_DURATIONS, RecipeSchema } from "../src/shared/recipe";
import { emptyRecipe, NOW } from "./helpers/recipe";

const later = new Date("2026-10-17T13:00:00.000Z");
const media = (duration: number) => ({ path: "clips/2026-10/a.mp4", duration });

describe("applyClipMedia", () => {
  it("sets the clip with a default trim of the slot's length", () => {
    const next = applyClipMedia(
      emptyRecipe(),
      "before",
      media(12.4),
      DEFAULT_CLIP_DURATIONS,
      later,
    );
    expect(next.clips[0]).toMatchObject({
      mediaPath: "clips/2026-10/a.mp4",
      sourceDuration: 12.4,
      trimStart: 0,
      duration: 3,
    });
    expect(next.updatedAt).toBe(later.toISOString());
    expect(next.createdAt).toBe(NOW.toISOString());
    expect(RecipeSchema.safeParse(next).success).toBe(true);
  });

  it("uses the whole clip when it is shorter than the slot default", () => {
    const next = applyClipMedia(
      emptyRecipe(),
      "after",
      media(1.5),
      DEFAULT_CLIP_DURATIONS,
      later,
    );
    expect(next.clips[1].duration).toBe(1.5);
    expect(
      next.clips[1].trimStart + next.clips[1].duration,
    ).toBeLessThanOrEqual(next.clips[1].sourceDuration);
    expect(RecipeSchema.safeParse(next).success).toBe(true);
  });

  it("uses custom defaults from settings", () => {
    const next = applyClipMedia(
      emptyRecipe(),
      "broll",
      media(20),
      { before: 2, after: 2, broll: 7.5 },
      later,
    );
    expect(next.clips[2].duration).toBe(7.5);
  });

  it("keeps caption, zoom and mute on replacement, resets trim and focus", () => {
    const first = applyClipMedia(
      emptyRecipe(),
      "before",
      media(10),
      DEFAULT_CLIP_DURATIONS,
      later,
    );
    first.clips[0] = {
      ...first.clips[0],
      zoom: "slow-push",
      muted: true,
      trimStart: 4,
      focus: { x: 0.2, y: 0.9 },
      caption: { text: "hi", style: "box", position: "top" },
    };
    const next = applyClipMedia(
      first,
      "before",
      { path: "clips/2026-10/b.mp4", duration: 6 },
      DEFAULT_CLIP_DURATIONS,
      later,
    );
    expect(next.clips[0]).toMatchObject({
      mediaPath: "clips/2026-10/b.mp4",
      zoom: "slow-push",
      muted: true,
      trimStart: 0,
      focus: { x: 0.5, y: 0.5 },
      caption: { text: "hi" },
    });
  });

  it("does not touch the other slots or mutate the input", () => {
    const recipe = emptyRecipe();
    const next = applyClipMedia(
      recipe,
      "after",
      media(5),
      DEFAULT_CLIP_DURATIONS,
      later,
    );
    expect(recipe.clips[1].mediaPath).toBe("");
    expect(next.clips[0]).toEqual(recipe.clips[0]);
    expect(next.clips[2]).toEqual(recipe.clips[2]);
  });

  it("refuses a clip with no length", () => {
    expect(() =>
      applyClipMedia(
        emptyRecipe(),
        "before",
        media(0),
        DEFAULT_CLIP_DURATIONS,
        later,
      ),
    ).toThrow();
  });
});

describe("clearClip, draftHasMedia, filledSlots", () => {
  it("empties a slot and restores the default length", () => {
    const filled = applyClipMedia(
      emptyRecipe(),
      "before",
      media(1.5),
      DEFAULT_CLIP_DURATIONS,
      later,
    );
    expect(draftHasMedia(filled)).toBe(true);
    expect(filledSlots(filled)).toBe(1);
    const cleared = clearClip(filled, "before", DEFAULT_CLIP_DURATIONS, later);
    expect(cleared.clips[0]).toMatchObject({
      mediaPath: "",
      sourceDuration: 0,
      duration: 3,
    });
    expect(draftHasMedia(cleared)).toBe(false);
    expect(RecipeSchema.safeParse(cleared).success).toBe(true);
  });
});

describe("slotStatus", () => {
  const empty = { mediaPath: "" };
  const filled = { mediaPath: "clips/x.mp4" };
  const none = { importing: false, error: false, missing: false };

  it("covers the five states", () => {
    expect(slotStatus(empty, none)).toBe("empty");
    expect(slotStatus(filled, none)).toBe("ready");
    expect(slotStatus(filled, { ...none, missing: true })).toBe("missing");
    expect(slotStatus(empty, { ...none, error: true })).toBe("error");
    expect(slotStatus(filled, { ...none, importing: true })).toBe("importing");
  });

  it("an import in flight wins over an error", () => {
    expect(
      slotStatus(empty, { importing: true, error: true, missing: false }),
    ).toBe("importing");
  });
});

describe("applyTrim", () => {
  it("sets the trim window of one slot and stamps updatedAt", () => {
    const filled = applyClipMedia(
      emptyRecipe(),
      "before",
      media(12),
      DEFAULT_CLIP_DURATIONS,
      NOW,
    );
    const next = applyTrim(
      filled,
      "before",
      { start: 2.5, duration: 4 },
      later,
    );
    expect(next.clips[0]).toMatchObject({ trimStart: 2.5, duration: 4 });
    expect(next.clips[1]).toBe(filled.clips[1]);
    expect(next.updatedAt).toBe(later.toISOString());
    expect(RecipeSchema.safeParse(next).success).toBe(true);
    // The input is untouched.
    expect(filled.clips[0].trimStart).toBe(0);
  });
});

describe("zoom and mute", () => {
  it("zoom on is slow push, off is none", () => {
    const on = applyZoom(emptyRecipe(), "after", true, later);
    expect(on.clips[1].zoom).toBe("slow-push");
    expect(on.updatedAt).toBe(later.toISOString());
    expect(applyZoom(on, "after", false, later).clips[1].zoom).toBe("none");
    expect(on.clips[0].zoom).toBe("none");
  });

  it("any zoom style other than none reads as on", () => {
    expect(isZoomOn({ zoom: "none" })).toBe(false);
    expect(isZoomOn({ zoom: "slow-push" })).toBe(true);
    expect(isZoomOn({ zoom: "punch-in" })).toBe(true);
  });

  it("mute changes only its slot", () => {
    const next = applyMuted(emptyRecipe(), "broll", false, later);
    expect(next.clips.map((c) => c.muted)).toEqual([false, false, false]);
    expect(applyMuted(next, "before", true, later).clips[0].muted).toBe(true);
  });
});

describe("captions", () => {
  const pick = { text: "10/10 the 501s", sourceCaptionId: "c1" };

  it("a first pick uses outline / middle", () => {
    const next = applyCaptionPick(emptyRecipe(), "before", pick, later);
    expect(next.clips[0].caption).toEqual({
      text: "10/10 the 501s",
      sourceCaptionId: "c1",
      style: "outline",
      position: "middle",
    });
    expect(RecipeSchema.safeParse(next).success).toBe(true);
  });

  it("a pick keeps the look the slot's caption already has", () => {
    let recipe = applyCaptionPick(emptyRecipe(), "before", pick, later);
    recipe = applyCaptionLook(
      recipe,
      "before",
      { style: "box", position: "top" },
      later,
    );
    const next = applyCaptionPick(
      recipe,
      "before",
      { text: "another", sourceCaptionId: "c2" },
      later,
    );
    expect(next.clips[0].caption).toEqual({
      text: "another",
      sourceCaptionId: "c2",
      style: "box",
      position: "top",
    });
  });

  it("a new caption copies the look of another slot (before, then after, then broll)", () => {
    let recipe = emptyRecipe();
    recipe = applyCaptionPick(recipe, "broll", pick, later);
    recipe = applyCaptionLook(recipe, "broll", { style: "box" }, later);
    expect(defaultCaptionLook(recipe, "before")).toEqual({
      style: "box",
      position: "middle",
    });

    recipe = applyCaptionPick(recipe, "after", pick, later);
    recipe = applyCaptionLook(
      recipe,
      "after",
      { style: "outline", position: "top" },
      later,
    );
    // After wins over broll.
    expect(defaultCaptionLook(recipe, "before")).toEqual({
      style: "outline",
      position: "top",
    });

    recipe = applyCaptionPick(recipe, "before", pick, later);
    recipe = applyCaptionLook(recipe, "before", { style: "box" }, later);
    // Before wins for the other two; a slot's own caption never counts for itself.
    expect(defaultCaptionLook(recipe, "after")).toEqual({
      style: "box",
      position: "top",
    });
    expect(
      applyCaptionPick(
        clearCaption(recipe, "after", later),
        "after",
        pick,
        later,
      ).clips[1].caption,
    ).toMatchObject({ style: "box", position: "top" });
  });

  it("with no caption anywhere the default look is outline / middle", () => {
    expect(defaultCaptionLook(emptyRecipe(), "after")).toEqual({
      style: "outline",
      position: "middle",
    });
  });

  it("typing creates a caption (no source) with the default look", () => {
    const other = applyCaptionLook(
      applyCaptionPick(emptyRecipe(), "before", pick, later),
      "before",
      { style: "box", position: "top" },
      later,
    );
    const next = applyCaptionText(other, "after", "my own words", later);
    expect(next.clips[1].caption).toEqual({
      text: "my own words",
      style: "box",
      position: "top",
    });
  });

  it("typing keeps the look and the source of an existing caption", () => {
    let recipe = applyCaptionPick(emptyRecipe(), "before", pick, later);
    recipe = applyCaptionLook(recipe, "before", { style: "box" }, later);
    const next = applyCaptionText(recipe, "before", "edited", later);
    expect(next.clips[0].caption).toEqual({
      text: "edited",
      sourceCaptionId: "c1",
      style: "box",
      position: "middle",
    });
    // Emptying the box keeps the caption (and its look); only Clear removes it.
    expect(
      applyCaptionText(next, "before", "", later).clips[0].caption,
    ).toMatchObject({
      text: "",
      style: "box",
    });
  });

  it("look changes need a caption", () => {
    const recipe = emptyRecipe();
    expect(applyCaptionLook(recipe, "before", { style: "box" }, later)).toBe(
      recipe,
    );
  });

  it("re-points the source and clears", () => {
    let recipe = applyCaptionPick(emptyRecipe(), "before", pick, later);
    recipe = applySourceCaption(recipe, "before", "c9", later);
    expect(recipe.clips[0].caption?.sourceCaptionId).toBe("c9");
    expect(clearCaption(recipe, "before", later).clips[0].caption).toBeNull();
    const none = emptyRecipe();
    expect(applySourceCaption(none, "before", "c9", later)).toBe(none);
  });
});
