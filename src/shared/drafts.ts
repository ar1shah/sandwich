// Reading drafts back out of the videos table. Pure.
import { filledSlots } from "./editorRecipe";
import type { Video } from "./library";
import { RecipeSchema, totalDuration, type Recipe } from "./recipe";

// null = the stored JSON is unreadable or no longer matches the schema.
export function parseDraftRecipe(recipeJson: string): Recipe | null {
  try {
    const parsed = RecipeSchema.safeParse(JSON.parse(recipeJson));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// The product's slug is editable, so a recipe opened later takes the current one. Export
// (3.5) must name files from the current slug as well, never from a stale copy.
export function withProductSlug(recipe: Recipe, slug: string): Recipe {
  return recipe.productSlug === slug
    ? recipe
    : { ...recipe, productSlug: slug };
}

export type DraftSummary = {
  id: string;
  productId: string;
  updatedAt: string;
  // false = the recipe could not be read; only Delete makes sense.
  readable: boolean;
  filledSlots: number;
  totalDuration: number;
};

export function summarizeDraft(
  video: Pick<Video, "id" | "productId" | "recipeJson" | "updatedAt">,
): DraftSummary {
  const recipe = parseDraftRecipe(video.recipeJson);
  return {
    id: video.id,
    productId: video.productId,
    updatedAt: video.updatedAt,
    readable: recipe !== null,
    filledSlots: recipe ? filledSlots(recipe) : 0,
    totalDuration: recipe ? totalDuration(recipe) : 0,
  };
}
