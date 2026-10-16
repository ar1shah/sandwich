import { z } from "zod";

// The Recipe is the product (CLAUDE.md golden rule 1). Shape: docs/reference/SPEC.md section 3.
// Pure: ids and clocks are passed in so this file needs no Node or DOM imports.

export const SLOTS = ["before", "after", "broll"] as const;
export type Slot = (typeof SLOTS)[number];

export const ZOOM_STYLES = ["none", "slow-push", "punch-in"] as const;

// Default clip lengths in seconds (SPEC section 1). Settings can override them.
export const DEFAULT_CLIP_DURATIONS: Record<Slot, number> = {
  before: 3,
  after: 4,
  broll: 5,
};

// Float slack for trimStart + duration <= sourceDuration (trims snap to 0.1 s).
const TRIM_EPSILON = 1e-6;

const CaptionSchema = z.object({
  text: z.string(),
  sourceCaptionId: z.string().optional(),
  style: z.enum(["outline", "box"]),
  position: z.enum(["top", "middle"]),
});

const unit = z.number().min(0).max(1);

function clipSchema<S extends Slot>(slot: S) {
  return z
    .object({
      slot: z.literal(slot),
      mediaPath: z.string(), // relative to the library root; "" means the slot is still empty
      sourceDuration: z.number().finite().min(0),
      trimStart: z.number().finite().min(0),
      duration: z.number().finite().positive(),
      zoom: z.enum(ZOOM_STYLES),
      focus: z.object({ x: unit, y: unit }),
      muted: z.boolean(),
      caption: CaptionSchema.nullable(),
    })
    .superRefine((clip, ctx) => {
      // An empty slot (no media yet) has no source to trim, so only filled slots are checked.
      if (clip.mediaPath === "") {
        return;
      }
      if (clip.trimStart + clip.duration > clip.sourceDuration + TRIM_EPSILON) {
        ctx.addIssue({
          code: "custom",
          path: ["duration"],
          message: `trimStart (${clip.trimStart}) + duration (${clip.duration}) exceeds sourceDuration (${clip.sourceDuration})`,
        });
      }
    });
}

export const ClipSpecSchema = z.discriminatedUnion("slot", [
  clipSchema("before"),
  clipSchema("after"),
  clipSchema("broll"),
]);

export const RecipeSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.uuid(),
  productId: z.string().min(1),
  productSlug: z.string().min(1),
  // Order is part of the type: always before, after, broll.
  clips: z.tuple([
    clipSchema("before"),
    clipSchema("after"),
    clipSchema("broll"),
  ]),
  output: z.object({
    width: z.literal(1080),
    height: z.literal(1920),
    fps: z.literal(30),
  }),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type ClipSpec = z.infer<typeof ClipSpecSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
export type ZoomStyle = ClipSpec["zoom"];
export type ClipCaption = NonNullable<ClipSpec["caption"]>;

export function totalDuration(recipe: Pick<Recipe, "clips">): number {
  return recipe.clips.reduce((sum, clip) => sum + clip.duration, 0);
}

// Render gate: every slot must have media. (Shape validity is RecipeSchema's job.)
export function isRenderable(recipe: Pick<Recipe, "clips">): boolean {
  return recipe.clips.every((clip) => clip.mediaPath !== "");
}

export type RecipeProduct = { id: string; slug: string };

export type RecipeDefaults = {
  clipDurations: Record<Slot, number>;
};

export type RecipeMeta = {
  id: string; // uuid, from crypto.randomUUID() in the caller
  now: Date;
};

export function createEmptyRecipe(
  product: RecipeProduct,
  defaults: RecipeDefaults,
  meta: RecipeMeta,
): Recipe {
  const empty = <S extends Slot>(slot: S, muted: boolean) => ({
    slot,
    mediaPath: "",
    sourceDuration: 0,
    trimStart: 0,
    duration: defaults.clipDurations[slot],
    zoom: "none" as const,
    focus: { x: 0.5, y: 0.5 },
    muted,
    caption: null,
  });
  const timestamp = meta.now.toISOString();
  return {
    schemaVersion: 1,
    id: meta.id,
    productId: product.id,
    productSlug: product.slug,
    clips: [
      empty("before", false),
      empty("after", false),
      empty("broll", true),
    ],
    output: { width: 1080, height: 1920, fps: 30 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
