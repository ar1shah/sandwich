import { describe, expect, it } from "vitest";
import {
  applyClipMedia,
  clearClip,
  draftHasMedia,
  filledSlots,
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
