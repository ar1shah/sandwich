import { CAPTION_SLOT_LABELS } from "../../../shared/captions";
import type { CaptionSlot } from "../../../shared/captionFilter";
import { SAMPLE_TOKEN_PRODUCT } from "../../../shared/captions";
import type { TokenProduct } from "../../../shared/tokens";
import type { ProductSummary } from "../../../shared/products";

export const PRIMARY =
  "rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";
export const SECONDARY =
  "rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50";
export const INPUT =
  "w-full rounded-md border border-edge bg-app px-3 py-2 text-sm outline-none placeholder:text-app-dim focus:border-brand";

export const SlotBadge: React.FC<{ slot: CaptionSlot }> = ({ slot }) => (
  <span
    className={
      "inline-block rounded px-2 py-0.5 text-xs font-medium " +
      (slot === "any"
        ? "bg-white/5 text-app-muted"
        : "bg-brand/15 text-app-text")
    }
  >
    {CAPTION_SLOT_LABELS[slot]}
  </span>
);

export const Warning: React.FC<{ message: string }> = ({ message }) => (
  <p
    role="note"
    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
  >
    {message}
  </p>
);

// Products by id, archived ones included (their captions still show their name).
export function productsById(
  products: readonly ProductSummary[],
): Map<string, ProductSummary> {
  return new Map(products.map((p) => [p.id, p]));
}

// What {product} resolves against: the product when there is one, else the sample.
export function tokenProduct(
  product: ProductSummary | undefined,
): TokenProduct {
  return product ?? SAMPLE_TOKEN_PRODUCT;
}
