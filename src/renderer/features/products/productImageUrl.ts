import { mediaUrl } from "../../../shared/mediaUrl";
import type { Product } from "../../../shared/library";

// The card photo. The media server caches by URL (max-age 1 hour) and ignores the query
// string, so `?v=updatedAt` makes a replaced photo show up straight away.
export function productImageUrl(
  mediaBase: string | null,
  product: Pick<Product, "imagePath" | "updatedAt">,
): string | null {
  if (!mediaBase || !product.imagePath) {
    return null;
  }
  return `${mediaUrl(mediaBase, product.imagePath)}?v=${encodeURIComponent(product.updatedAt)}`;
}
