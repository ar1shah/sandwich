import type { Recipe, Slot } from "../src/shared/recipe";

// inputProps of the "Sandwich" composition. The Player, Remotion Studio and renderMedia all
// pass the same shape (golden rule 2: preview must equal export).
export type SandwichProps = {
  recipe: Recipe;
  // http://127.0.0.1:<port>/m/<token>; contains the token, so never log it.
  mediaBaseUrl: string;
  // Debug overlays, off by default.
  showSafeZone?: boolean;
  showTimecode?: boolean;
  // Editor preview only: a label to draw in a slot that has no usable media (empty, or its
  // file is missing). Never set by a render; exports are gated by isRenderable.
  placeholders?: Partial<Record<Slot, string>>;
};
