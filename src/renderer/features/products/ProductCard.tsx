import { Thumb } from "../../components/Thumb";
import type { ProductSummary } from "../../../shared/products";

export function brollLabel(count: number): string {
  if (count === 0) {
    return "No b-roll yet";
  }
  return count === 1 ? "1 b-roll clip" : `${count} b-roll clips`;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}

// A stable tint per product so placeholders are easy to tell apart.
export function tint(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  }
  return `hsl(${hash} 35% 28%)`;
}

type ProductCardProps = {
  product: ProductSummary;
  imageUrl: string | null;
  onSelect: () => void;
  // Edit and delete buttons that appear on hover or focus. Omit in pickers.
  onEdit?: () => void;
  onDelete?: () => void;
  // Picker mode: option semantics and a highlight for the keyboard cursor.
  option?: { id: string; active: boolean };
};

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  imageUrl,
  onSelect,
  onEdit,
  onDelete,
  option,
}) => {
  return (
    <li
      id={option?.id}
      role={option ? "option" : undefined}
      aria-selected={option ? option.active : undefined}
      className={
        "group relative flex flex-col overflow-hidden rounded-xl border bg-panel transition-colors " +
        (option?.active
          ? "border-brand ring-2 ring-brand/60"
          : "border-edge hover:border-white/20")
      }
    >
      <button
        type="button"
        onClick={onSelect}
        // Pickers keep focus in the search box.
        tabIndex={option ? -1 : undefined}
        className="flex flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <div className="aspect-square w-full overflow-hidden bg-black/30">
          <Thumb
            src={imageUrl}
            draggable={false}
            className="h-full w-full object-cover"
            fallback={
              <div
                aria-hidden="true"
                className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white/70"
                style={{ background: tint(product.fullName) }}
              >
                {initials(product.fullName)}
              </div>
            }
          />
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-3">
          <span className="line-clamp-2 text-sm font-medium leading-snug">
            {product.fullName}
          </span>
          {product.shortName && (
            <span className="truncate text-xs text-app-muted">
              {product.shortName}
            </span>
          )}
          <span className="mt-1 text-xs text-app-dim">
            {brollLabel(product.brollCount)}
          </span>
        </div>
      </button>
      {(onEdit || onDelete) && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${product.fullName}`}
              className="rounded-md bg-black/70 px-2 py-1 text-xs hover:bg-black"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${product.fullName}`}
              className="rounded-md bg-black/70 px-2 py-1 text-xs text-red-300 hover:bg-black"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  );
};

export const PRODUCT_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4";
