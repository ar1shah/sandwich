import type { Slot } from "./recipe";

// Caption picker filtering (docs/reference/SPEC.md section 2): when editing slot X for product P,
// show captions where slot is X or any, AND product is P or generic (null). Product-specific
// captions sort first, then most used first.

export const CAPTION_SLOTS = ["before", "after", "broll", "any"] as const;
export type CaptionSlot = (typeof CAPTION_SLOTS)[number];

export type FilterableCaption = {
  slot: CaptionSlot;
  productId: string | null; // null = generic template
  useCount: number;
};

export function filterCaptions<T extends FilterableCaption>(
  captions: readonly T[],
  options: { slot: Slot; productId: string },
): T[] {
  return captions
    .filter(
      (c) =>
        (c.slot === options.slot || c.slot === "any") &&
        (c.productId === options.productId || c.productId === null),
    )
    .sort((a, b) => {
      const aSpecific = a.productId === null ? 1 : 0;
      const bSpecific = b.productId === null ? 1 : 0;
      if (aSpecific !== bSpecific) {
        return aSpecific - bSpecific;
      }
      return b.useCount - a.useCount; // Array.prototype.sort is stable, so ties keep input order
    });
}
