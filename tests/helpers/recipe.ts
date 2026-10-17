import { randomUUID } from "node:crypto";
import {
  createEmptyRecipe,
  DEFAULT_CLIP_DURATIONS,
  type Recipe,
} from "../../src/shared/recipe";

export const NOW = new Date("2026-10-17T12:00:00.000Z");

export function emptyRecipe(
  product: { id: string; slug: string } = { id: "p1", slug: "p-one" },
): Recipe {
  return createEmptyRecipe(
    product,
    { clipDurations: { ...DEFAULT_CLIP_DURATIONS } },
    { id: randomUUID(), now: NOW },
  );
}

// A recipe whose before clip is filled.
export function recipeWithBefore(product?: {
  id: string;
  slug: string;
}): Recipe {
  const recipe = emptyRecipe(product);
  recipe.clips[0] = {
    ...recipe.clips[0],
    mediaPath: "clips/2026-10/a.mp4",
    sourceDuration: 8,
    duration: 3,
  };
  return recipe;
}
