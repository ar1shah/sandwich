// Filtering and ordering for the caption bank page and the product's Captions tab. Pure.
// The editor's picker uses filterCaptions (captionFilter.ts) instead.
import type { CaptionSlot } from "./captionFilter";

export type ProductFilter =
  | { kind: "all" }
  | { kind: "generic" }
  | { kind: "product"; id: string };

export type SearchableCaption = {
  text: string;
  slot: CaptionSlot;
  productId: string | null;
  createdAt: string;
};

// Newest first. The input arrives oldest first and ties (a bulk add shares one timestamp)
// keep that order, so a pasted list reads top to bottom as it was written.
function newestFirst<T extends { createdAt: string }>(captions: T[]): T[] {
  return captions.sort((a, b) =>
    a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1,
  );
}

// True when every word of the query appears in the text (case-insensitive). Pass both the
// stored text and, when known, the version with tokens filled in, so "501s" finds
// "10/10 {product}" for a product called "the 501s".
export function matchesQuery(
  query: string,
  ...texts: readonly (string | null | undefined)[]
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const haystack = texts
    .filter((t): t is string => typeof t === "string")
    .join("\n")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function filterCaptionList<T extends SearchableCaption>(
  captions: readonly T[],
  options: {
    slot: CaptionSlot | "all";
    product: ProductFilter;
    query: string;
  },
): T[] {
  return newestFirst(
    captions.filter((c) => {
      if (options.slot !== "all" && c.slot !== options.slot) {
        return false;
      }
      if (options.product.kind === "generic" && c.productId !== null) {
        return false;
      }
      if (
        options.product.kind === "product" &&
        c.productId !== options.product.id
      ) {
        return false;
      }
      return matchesQuery(options.query, c.text);
    }),
  );
}

// A product's captions plus the generic ones, its own first.
export function captionsForProduct<T extends SearchableCaption>(
  captions: readonly T[],
  productId: string,
): T[] {
  const own = newestFirst(captions.filter((c) => c.productId === productId));
  const generic = newestFirst(captions.filter((c) => c.productId === null));
  return [...own, ...generic];
}
