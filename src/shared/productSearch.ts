// Search and ordering for the product grid and picker. Pure.
import type { Product } from "./library";

type Searchable = Pick<Product, "fullName" | "shortName" | "slug">;

// Lowercase, accents removed, so "creme" finds "Crème".
function fold(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

// Every whitespace-separated term must appear in the full name, short name or slug.
// An empty query matches everything.
export function filterProducts<T extends Searchable>(
  products: readonly T[],
  query: string,
): T[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [...products];
  }
  return products.filter((product) => {
    const haystack = fold(
      [product.fullName, product.shortName ?? "", product.slug].join(" "),
    );
    return terms.every((term) => haystack.includes(term));
  });
}

// Recently used first (newest first), then the rest by name.
export function orderProducts<
  T extends Pick<Product, "fullName" | "lastUsedAt">,
>(products: readonly T[]): T[] {
  return [...products].sort((a, b) => {
    if (a.lastUsedAt && b.lastUsedAt) {
      if (a.lastUsedAt !== b.lastUsedAt) {
        return a.lastUsedAt < b.lastUsedAt ? 1 : -1;
      }
    } else if (a.lastUsedAt || b.lastUsedAt) {
      return a.lastUsedAt ? -1 : 1;
    }
    return a.fullName.localeCompare(b.fullName, undefined, {
      sensitivity: "base",
    });
  });
}
