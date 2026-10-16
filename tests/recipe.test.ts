import { describe, expect, it } from "vitest";
import {
  ClipSpecSchema,
  DEFAULT_CLIP_DURATIONS,
  RecipeSchema,
  createEmptyRecipe,
  isRenderable,
  totalDuration,
  type Recipe,
} from "../src/shared/recipe";
import { buildSampleRecipe } from "../scripts/fixtures/specs";

const ID = "5b0f2f0e-4c4f-4a53-9d0a-2f6d9a7c1b11";
const NOW = new Date("2026-10-15T18:30:00.000Z");
const product = { id: "prod-1", slug: "levis-501" };
const defaults = { clipDurations: DEFAULT_CLIP_DURATIONS };

function filled(): Recipe {
  const recipe = createEmptyRecipe(product, defaults, { id: ID, now: NOW });
  recipe.clips[0].mediaPath = "media/before.mp4";
  recipe.clips[0].sourceDuration = 8;
  recipe.clips[1].mediaPath = "media/after.mp4";
  recipe.clips[1].sourceDuration = 8;
  recipe.clips[2].mediaPath = "media/broll.mp4";
  recipe.clips[2].sourceDuration = 8;
  return recipe;
}

describe("createEmptyRecipe", () => {
  const recipe = createEmptyRecipe(product, defaults, { id: ID, now: NOW });

  it("builds an empty draft that still parses", () => {
    expect(RecipeSchema.safeParse(recipe).success).toBe(true);
  });

  it("uses the product, injected id and clock", () => {
    expect(recipe).toMatchObject({
      schemaVersion: 1,
      id: ID,
      productId: "prod-1",
      productSlug: "levis-501",
      createdAt: "2026-10-15T18:30:00.000Z",
      updatedAt: "2026-10-15T18:30:00.000Z",
      output: { width: 1080, height: 1920, fps: 30 },
    });
  });

  it("orders clips before, after, broll with default lengths", () => {
    expect(recipe.clips.map((c) => c.slot)).toEqual([
      "before",
      "after",
      "broll",
    ]);
    expect(recipe.clips.map((c) => c.duration)).toEqual([3, 4, 5]);
  });

  it("mutes only the b-roll and centres the focus point", () => {
    expect(recipe.clips.map((c) => c.muted)).toEqual([false, false, true]);
    for (const clip of recipe.clips) {
      expect(clip).toMatchObject({
        mediaPath: "",
        trimStart: 0,
        zoom: "none",
        caption: null,
        focus: { x: 0.5, y: 0.5 },
      });
    }
  });

  it("honours custom default durations", () => {
    const custom = createEmptyRecipe(
      product,
      { clipDurations: { before: 2.5, after: 3.5, broll: 6 } },
      { id: ID, now: NOW },
    );
    expect(totalDuration(custom)).toBe(12);
  });
});

describe("totalDuration / isRenderable", () => {
  it("sums clip durations", () => {
    expect(totalDuration(filled())).toBe(12);
  });

  it("is not renderable while any slot is empty", () => {
    expect(
      isRenderable(createEmptyRecipe(product, defaults, { id: ID, now: NOW })),
    ).toBe(false);
    const partial = filled();
    partial.clips[2].mediaPath = "";
    expect(isRenderable(partial)).toBe(false);
  });

  it("is renderable when all three clips have media", () => {
    expect(isRenderable(filled())).toBe(true);
  });
});

describe("RecipeSchema refinements", () => {
  it("accepts a filled recipe", () => {
    expect(RecipeSchema.safeParse(filled()).success).toBe(true);
  });

  it("accepts trimStart + duration exactly at sourceDuration", () => {
    const r = filled();
    r.clips[0].trimStart = 5;
    r.clips[0].duration = 3;
    expect(RecipeSchema.safeParse(r).success).toBe(true);
  });

  it("tolerates float noise at the boundary", () => {
    const r = filled();
    r.clips[0].trimStart = 0.1 + 0.2; // 0.30000000000000004
    r.clips[0].duration = 7.7;
    expect(RecipeSchema.safeParse(r).success).toBe(true);
  });

  it("rejects trimStart + duration past sourceDuration", () => {
    const r = filled();
    r.clips[0].trimStart = 5.1;
    r.clips[0].duration = 3;
    const result = RecipeSchema.safeParse(r);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["clips", 0, "duration"]);
  });

  it("skips the trim check only while mediaPath is empty", () => {
    const r = filled();
    r.clips[1].sourceDuration = 0;
    expect(RecipeSchema.safeParse(r).success).toBe(false);
    r.clips[1].mediaPath = "";
    expect(RecipeSchema.safeParse(r).success).toBe(true);
  });

  it("rejects zero, negative and non-finite durations", () => {
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = filled();
      r.clips[0].duration = duration;
      expect(RecipeSchema.safeParse(r).success).toBe(false);
    }
  });

  it("rejects a negative trimStart", () => {
    const r = filled();
    r.clips[0].trimStart = -0.1;
    expect(RecipeSchema.safeParse(r).success).toBe(false);
  });

  it("rejects clips out of order or with a wrong slot", () => {
    const r = filled();
    const swapped = { ...r, clips: [r.clips[1], r.clips[0], r.clips[2]] };
    expect(RecipeSchema.safeParse(swapped).success).toBe(false);
    const wrongSlot = { ...r, clips: [r.clips[0], r.clips[0], r.clips[2]] };
    expect(RecipeSchema.safeParse(wrongSlot).success).toBe(false);
  });

  it("rejects the wrong number of clips", () => {
    const r = filled();
    expect(
      RecipeSchema.safeParse({ ...r, clips: r.clips.slice(0, 2) }).success,
    ).toBe(false);
    expect(
      RecipeSchema.safeParse({ ...r, clips: [...r.clips, r.clips[2]] }).success,
    ).toBe(false);
  });

  it("rejects focus outside 0..1", () => {
    const r = filled();
    r.clips[0].focus = { x: 1.2, y: 0.5 };
    expect(RecipeSchema.safeParse(r).success).toBe(false);
  });

  it("rejects unknown zoom styles and caption options", () => {
    const zoom = filled();
    (zoom.clips[0] as { zoom: string }).zoom = "spin";
    expect(RecipeSchema.safeParse(zoom).success).toBe(false);

    const style = filled();
    style.clips[0].caption = {
      text: "hi",
      style: "neon" as "box",
      position: "top",
    };
    expect(RecipeSchema.safeParse(style).success).toBe(false);
  });

  it("accepts captions with an optional sourceCaptionId", () => {
    const r = filled();
    r.clips[0].caption = {
      text: "hi",
      style: "box",
      position: "middle",
      sourceCaptionId: "c1",
    };
    r.clips[1].caption = { text: "yo", style: "outline", position: "top" };
    expect(RecipeSchema.safeParse(r).success).toBe(true);
  });

  it("pins schemaVersion and the output spec", () => {
    const r = filled();
    expect(RecipeSchema.safeParse({ ...r, schemaVersion: 2 }).success).toBe(
      false,
    );
    expect(
      RecipeSchema.safeParse({
        ...r,
        output: { width: 720, height: 1280, fps: 30 },
      }).success,
    ).toBe(false);
    expect(
      RecipeSchema.safeParse({ ...r, output: { ...r.output, fps: 60 } })
        .success,
    ).toBe(false);
  });

  it("requires a uuid id, a product, and ISO timestamps", () => {
    const r = filled();
    expect(RecipeSchema.safeParse({ ...r, id: "nope" }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...r, productId: "" }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...r, productSlug: "" }).success).toBe(
      false,
    );
    expect(
      RecipeSchema.safeParse({ ...r, createdAt: "yesterday" }).success,
    ).toBe(false);
  });

  it("survives a JSON round trip (the sidecar file)", () => {
    const r = filled();
    expect(RecipeSchema.parse(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
});

describe("ClipSpecSchema", () => {
  it("dispatches on slot", () => {
    const clip = filled().clips[2];
    expect(ClipSpecSchema.safeParse(clip).success).toBe(true);
    expect(ClipSpecSchema.safeParse({ ...clip, slot: "intro" }).success).toBe(
      false,
    );
  });
});

describe("fixture sample recipe", () => {
  it("parses with RecipeSchema (guards against the schema drifting from the generator)", () => {
    const sample = buildSampleRecipe({ before: 8, after: 8, broll: 8 });
    const parsed = RecipeSchema.parse(sample);
    expect(isRenderable(parsed)).toBe(true);
    expect(totalDuration(parsed)).toBe(12);
  });
});
