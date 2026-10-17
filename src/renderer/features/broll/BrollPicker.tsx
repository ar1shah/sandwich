import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import { nextGridIndex, type GridKey } from "../../../shared/gridNav";
import type { Media } from "../../../shared/library";
import { useProductsStore } from "../products/productsStore";
import { BROLL_GRID_CLASS, BrollTile } from "./BrollTile";
import { selectProductBroll, useBrollStore } from "./brollStore";

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
  return Math.max(
    1,
    getComputedStyle(grid).gridTemplateColumns.split(" ").length,
  );
}

// One product's b-roll in a modal, for choosing a clip in the editor. Hover previews a tile;
// arrows move the highlight (which previews it too), Enter picks it (or the first clip when
// nothing is highlighted), Escape closes.
export const BrollPicker: React.FC<{
  productId: string;
  onSelect: (media: Media) => void;
  onClose: () => void;
  title?: string;
}> = ({ productId, onSelect, onClose, title = "Choose b-roll" }) => {
  const entry = useBrollStore((s) => selectProductBroll(s, productId));
  const load = useBrollStore((s) => s.load);
  const mediaBase = useProductsStore((s) => s.mediaBase);
  const loadProducts = useProductsStore((s) => s.load);
  const listId = useId();
  const grid = useRef<HTMLUListElement>(null);
  const [cursor, setCursor] = useState(-1);

  useEffect(() => {
    void load(productId);
    void loadProducts();
  }, [load, loadProducts, productId]);

  const items = entry.items;
  const hasItems = items.length > 0;

  // React's autoFocus skips a <ul>, so focus the list once it exists.
  useEffect(() => {
    if (hasItems) {
      grid.current?.focus();
    }
  }, [hasItems]);
  const active = cursor < items.length ? cursor : -1;
  const optionId = (index: number) => `${listId}-${index}`;

  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (ARROWS.includes(event.key)) {
      event.preventDefault();
      setCursor(
        nextGridIndex(
          active,
          event.key as GridKey,
          items.length,
          columnCount(grid.current),
        ),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = items[active >= 0 ? active : 0];
      if (pick) {
        onSelect(pick);
      }
    }
  }

  return (
    <Modal title={title} onClose={onClose} widthClass="max-w-4xl">
      {!entry.loaded ? (
        <p className="mt-8 text-center text-sm text-app-muted">Loading...</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-center text-sm text-app-muted">
          No b-roll for this product yet. Add some on the product page.
        </p>
      ) : (
        <ul
          ref={grid}
          id={listId}
          role="listbox"
          aria-label="B-roll clips"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          // Focus lives on the list, like the search box in the product picker.
          tabIndex={0}
          onKeyDown={onKeyDown}
          className={`${BROLL_GRID_CLASS} mt-4 overflow-y-auto p-1 outline-none`}
        >
          {items.map((media, index) => (
            <BrollTile
              key={media.id}
              media={media}
              mediaBase={mediaBase}
              onSelect={() => onSelect(media)}
              option={{ id: optionId(index), active: index === active }}
            />
          ))}
        </ul>
      )}
    </Modal>
  );
};
