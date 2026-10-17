import { describe, expect, it } from "vitest";
import {
  parseDraftRecipe,
  summarizeDraft,
  withProductSlug,
} from "../src/shared/drafts";
import { emptyRecipe, recipeWithBefore } from "./helpers/recipe";

const video = (recipeJson: string) => ({
  id: "v1",
  productId: "p1",
  recipeJson,
  updatedAt: "2026-10-17T00:00:00.000Z",
});

describe("drafts", () => {
  it("parses a stored recipe and rejects junk", () => {
    const recipe = emptyRecipe();
    expect(parseDraftRecipe(JSON.stringify(recipe))?.id).toBe(recipe.id);
    expect(parseDraftRecipe("not json")).toBeNull();
    expect(parseDraftRecipe("{}")).toBeNull();
  });

  it("summarizes slots filled and total length", () => {
    const summary = summarizeDraft(video(JSON.stringify(recipeWithBefore())));
    expect(summary).toMatchObject({
      readable: true,
      filledSlots: 1,
      totalDuration: 12,
    });
  });

  it("flags an unreadable draft", () => {
    expect(summarizeDraft(video("{oops"))).toMatchObject({
      readable: false,
      filledSlots: 0,
      totalDuration: 0,
    });
  });

  it("takes the product's current slug", () => {
    const recipe = emptyRecipe();
    expect(withProductSlug(recipe, "p-one")).toBe(recipe);
    expect(withProductSlug(recipe, "renamed").productSlug).toBe("renamed");
    expect(recipe.productSlug).toBe("p-one");
  });
});
