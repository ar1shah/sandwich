import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import { nextGridIndex, type GridKey } from "../../../shared/gridNav";
import { filterProducts, orderProducts } from "../../../shared/productSearch";
import type { ProductSummary } from "../../../shared/products";
import { PRODUCT_GRID_CLASS, ProductCard } from "./ProductCard";
import { productImageUrl } from "./productImageUrl";
import { selectActive, useProductsStore } from "./productsStore";

const ARROWS: readonly string[] = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
];

function columnCount(grid: HTMLElement | null): number {
  if (!grid) {
    return 1;
  }
  const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  return Math.max(1, columns);
}

// The product card grid, for choosing a product in the editor or batch mode.
// Type to filter; arrows move the highlight, Enter picks it (or the first match when
// nothing is highlighted). Archived products are hidden.
// layout "modal" (default): in a dialog, Escape closes it.
// layout "page": the grid fills the page (New Video), Escape clears the search instead.
export const ProductPicker: React.FC<{
  onSelect: (product: ProductSummary) => void;
  // Needed for the modal layout.
  onClose?: () => void;
  title?: string;
  layout?: "modal" | "page";
}> = ({ onSelect, onClose, title = "Choose a product", layout = "modal" }) => {
  const products = useProductsStore((s) => s.products);
  const mediaBase = useProductsStore((s) => s.mediaBase);
  const load = useProductsStore((s) => s.load);
  const loaded = useProductsStore((s) => s.loaded);
  const listId = useId();
  const grid = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(-1);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => orderProducts(filterProducts(selectActive(products), query)),
    [products, query],
  );
  // A shrinking result list can leave the cursor past the end.
  const active = cursor < shown.length ? cursor : -1;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    if (active >= 0) {
      document
        .getElementById(optionId(active))
        ?.scrollIntoView({ block: "nearest" });
    }
    // optionId only depends on listId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (ARROWS.includes(event.key)) {
      const horizontal =
        event.key === "ArrowLeft" || event.key === "ArrowRight";
      // In the search box Left/Right move the text caret unless it is empty.
      if (horizontal && query !== "") {
        return;
      }
      event.preventDefault();
      setCursor(
        nextGridIndex(
          active,
          event.key as GridKey,
          shown.length,
          columnCount(grid.current),
        ),
      );
    } else if (event.key === "Escape" && layout === "page") {
      event.preventDefault();
      setQuery("");
      setCursor(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = shown[active >= 0 ? active : 0];
      if (pick) {
        onSelect(pick);
      }
    }
  }

  const content = (
    <>
      <input
        type="search"
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setCursor(-1);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search products"
        aria-label="Search products"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        className="mt-4 w-full rounded-md border border-edge bg-app px-3 py-2 text-sm outline-none placeholder:text-app-dim focus:border-brand"
      />
      {shown.length === 0 ? (
        <p className="mt-8 text-center text-sm text-app-muted">
          {!loaded
            ? "Loading products..."
            : products.length === 0
              ? "No products yet. Add one on the Products page."
              : "No products match your search."}
        </p>
      ) : (
        <ul
          ref={grid}
          id={listId}
          role="listbox"
          aria-label="Products"
          className={`${PRODUCT_GRID_CLASS} mt-4 overflow-y-auto`}
        >
          {shown.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              imageUrl={productImageUrl(mediaBase, product)}
              onSelect={() => onSelect(product)}
              option={{ id: optionId(index), active: index === active }}
            />
          ))}
        </ul>
      )}
    </>
  );

  return layout === "page" ? (
    content
  ) : (
    <Modal
      title={title}
      onClose={onClose ?? (() => undefined)}
      widthClass="max-w-4xl"
    >
      {content}
    </Modal>
  );
};
