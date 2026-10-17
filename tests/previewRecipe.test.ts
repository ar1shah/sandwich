import { describe, expect, it } from "vitest";
import { buildPreviewPlan } from "../src/shared/previewRecipe";
import { emptyRecipe, recipeWithBefore } from "./helpers/recipe";

describe("buildPreviewPlan", () => {
  it("labels every empty slot and keeps the draft object as is", () => {
    const draft = emptyRecipe();
    const plan = buildPreviewPlan(draft, {});
    expect(plan.recipe).toBe(draft);
    expect(plan.placeholders).toEqual({
      before: "Before: add a clip",
      after: "After: add a clip",
      broll: "B-roll: pick a clip",
    });
  });

  it("gives a filled slot no placeholder", () => {
    const plan = buildPreviewPlan(recipeWithBefore(), {});
    expect(plan.placeholders.before).toBeUndefined();
    expect(plan.placeholders.after).toBeDefined();
  });

  it("blanks a missing slot's media but keeps its length", () => {
    const draft = recipeWithBefore();
    const plan = buildPreviewPlan(draft, { before: true });
    expect(plan.recipe.clips[0].mediaPath).toBe("");
    expect(plan.recipe.clips[0].duration).toBe(draft.clips[0].duration);
    expect(plan.placeholders.before).toBe("Before: clip missing");
    // The draft itself is never touched: it is what gets saved.
    expect(draft.clips[0].mediaPath).toBe("clips/2026-10/a.mp4");
  });
});
