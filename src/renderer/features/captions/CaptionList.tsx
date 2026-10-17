import { useMemo } from "react";
import { resolveTokens } from "../../../shared/tokens";
import { unknownTokens } from "../../../shared/captions";
import type { Caption } from "../../../shared/library";
import type { ProductSummary } from "../../../shared/products";
import { productsById, SlotBadge } from "./captionUi";

const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_5rem_11rem_3.5rem_7rem] items-center gap-4";

const HEADER =
  "px-4 pb-2 text-xs font-medium uppercase tracking-wide text-app-dim";

// One row per caption: text (with the resolved version under it when the product is
// known), slot, product or Generic, use count, Edit and Delete.
export const CaptionList: React.FC<{
  captions: readonly Caption[];
  products: readonly ProductSummary[];
  onEdit: (caption: Caption) => void;
  onDelete: (caption: Caption) => void;
  label?: string;
}> = ({ captions, products, onEdit, onDelete, label = "Captions" }) => {
  const byId = useMemo(() => productsById(products), [products]);

  return (
    <div>
      <div className={`${COLUMNS} ${HEADER}`} aria-hidden="true">
        <span>Caption</span>
        <span>Slot</span>
        <span>Product</span>
        <span>Used</span>
        <span />
      </div>
      <ul aria-label={label} className="flex flex-col gap-2">
        {captions.map((caption) => {
          const product =
            caption.productId === null
              ? undefined
              : byId.get(caption.productId);
          const resolved = product
            ? resolveTokens(caption.text, product).text
            : null;
          const unknown = unknownTokens(caption.text);
          return (
            <li
              key={caption.id}
              data-testid="caption-row"
              className={`${COLUMNS} group rounded-lg border border-edge bg-panel px-4 py-3`}
            >
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words text-sm">
                  {caption.text}
                </p>
                {resolved !== null && resolved !== caption.text && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs text-app-muted">
                    {resolved}
                  </p>
                )}
                {unknown.length > 0 && (
                  <p className="mt-1 text-xs text-amber-300">
                    Unknown {unknown.length === 1 ? "token" : "tokens"}:{" "}
                    {unknown.join(", ")}
                  </p>
                )}
              </div>
              <div>
                <SlotBadge slot={caption.slot} />
              </div>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                {caption.productId === null ? (
                  <span className="text-app-muted">Generic</span>
                ) : (
                  <>
                    <span className="truncate" title={product?.fullName}>
                      {product?.shortName || product?.fullName || "Unknown"}
                    </span>
                    {product?.archivedAt != null && (
                      <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-xs text-app-muted">
                        Archived
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="text-sm text-app-muted">{caption.useCount}</div>
              <div className="flex justify-end gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => onEdit(caption)}
                  aria-label={`Edit caption: ${caption.text}`}
                  className="rounded px-2 py-1 text-app-muted hover:bg-white/5 hover:text-app-text"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(caption)}
                  aria-label={`Delete caption: ${caption.text}`}
                  className="rounded px-2 py-1 text-app-muted hover:bg-white/5 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
