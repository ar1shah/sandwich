import type { ClipSpec, Recipe, Slot } from "./recipe";

// The recipe the editor preview plays. Slots whose library file is gone are blanked so the
// Player never requests a 404 (the slot keeps its duration), and every slot without media
// gets a label for the composition to draw. Pure.

export const PLACEHOLDER_LABELS: Record<
  Slot,
  { empty: string; missing: string }
> = {
  before: { empty: "Before: add a clip", missing: "Before: clip missing" },
  after: { empty: "After: add a clip", missing: "After: clip missing" },
  broll: { empty: "B-roll: pick a clip", missing: "B-roll: clip missing" },
};

export type PreviewPlan = {
  recipe: Recipe;
  placeholders: Partial<Record<Slot, string>>;
};

export function buildPreviewPlan(
  draft: Recipe,
  missing: Partial<Record<Slot, true>>,
): PreviewPlan {
  const placeholders: Partial<Record<Slot, string>> = {};
  let changed = false;
  const clips = draft.clips.map((clip): ClipSpec => {
    if (clip.mediaPath === "") {
      placeholders[clip.slot] = PLACEHOLDER_LABELS[clip.slot].empty;
      return clip;
    }
    if (missing[clip.slot]) {
      placeholders[clip.slot] = PLACEHOLDER_LABELS[clip.slot].missing;
      changed = true;
      return { ...clip, mediaPath: "" };
    }
    return clip;
  }) as Recipe["clips"];
  return { recipe: changed ? { ...draft, clips } : draft, placeholders };
}
