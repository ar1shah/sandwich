import { useEffect, useId, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { filterCaptions } from "../../../shared/captionFilter";
import { matchesQuery } from "../../../shared/captionSearch";
import { unknownTokens, unknownTokensMessage } from "../../../shared/captions";
import { nextGridIndex } from "../../../shared/gridNav";
import type { Caption } from "../../../shared/library";
import type { Slot } from "../../../shared/recipe";
import { resolveTokens } from "../../../shared/tokens";
import { useProductsStore } from "../products/productsStore";
import { useCaptionsStore } from "./captionsStore";
import { INPUT, SlotBadge, tokenProduct } from "./captionUi";

// Captions for one slot of one product (its own plus generic, own first) in a modal, for the
// editor. Shows the text with {product} filled in; the search matches the stored and the
// filled-in text. ArrowUp/Down move the highlight, Enter picks it (or the first match),
// Escape closes. onSelect gets the caption and its resolved text.
export const CaptionPicker: React.FC<{
  slot: Slot;
  productId: string;
  onSelect: (caption: Caption, text: string) => void;
  onClose: () => void;
  title?: string;
}> = ({ slot, productId, onSelect, onClose, title = "Choose a caption" }) => {
  const captions = useCaptionsStore((s) => s.captions);
  const loaded = useCaptionsStore((s) => s.loaded);
  const load = useCaptionsStore((s) => s.load);
  const products = useProductsStore((s) => s.products);
  const loadProducts = useProductsStore((s) => s.load);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(-1);

  useEffect(() => {
    void load();
    void loadProducts();
  }, [load, loadProducts]);

  const product = tokenProduct(products.find((p) => p.id === productId));
  const shown = useMemo(
    () =>
      filterCaptions(captions, { slot, productId })
        .map((caption) => ({
          caption,
          text: resolveTokens(caption.text, product).text,
        }))
        .filter(({ caption, text }) => matchesQuery(query, caption.text, text)),
    [captions, slot, productId, product, query],
  );
  const active = cursor < shown.length ? cursor : -1;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    if (active >= 0) {
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [active, listId]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setCursor(nextGridIndex(active, event.key, shown.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = shown[active >= 0 ? active : 0];
      if (pick) {
        onSelect(pick.caption, pick.text);
      }
    }
  }

  return (
    <Modal title={title} onClose={onClose} widthClass="max-w-2xl">
      <input
        type="search"
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setCursor(-1);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search captions"
        aria-label="Search captions"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        className={`${INPUT} mt-4`}
      />
      {shown.length === 0 ? (
        <p className="mt-8 text-center text-sm text-app-muted">
          {!loaded
            ? "Loading..."
            : query.trim() !== ""
              ? "No captions match your search."
              : "No captions for this slot yet. Add some on the Captions page."}
        </p>
      ) : (
        <ul
          id={listId}
          role="listbox"
          aria-label="Captions"
          className="mt-4 flex flex-col gap-1.5 overflow-y-auto"
        >
          {shown.map(({ caption, text }, index) => {
            const unknown = unknownTokens(caption.text);
            return (
              <li
                key={caption.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onClick={() => onSelect(caption, text)}
                className={
                  "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm " +
                  (index === active
                    ? "border-brand bg-brand/10"
                    : "border-edge hover:bg-white/5")
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words">{text}</p>
                  {unknown.length > 0 && (
                    <p className="mt-0.5 text-xs text-amber-300">
                      {unknownTokensMessage(unknown)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <SlotBadge slot={caption.slot} />
                  <span className="text-xs text-app-dim">
                    {caption.productId === null ? "Generic" : "This product"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
};
