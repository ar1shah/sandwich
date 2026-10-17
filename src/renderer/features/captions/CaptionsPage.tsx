import { useEffect, useMemo, useState } from "react";
import { CAPTION_SLOTS, type CaptionSlot } from "../../../shared/captionFilter";
import {
  filterCaptionList,
  type ProductFilter,
} from "../../../shared/captionSearch";
import { CAPTION_SLOT_LABELS } from "../../../shared/captions";
import type { Caption } from "../../../shared/library";
import { ProductPicker } from "../products/ProductPicker";
import { selectActive, useProductsStore } from "../products/productsStore";
import { BulkAddModal } from "./BulkAddModal";
import { CaptionFormModal, type CaptionFormMode } from "./CaptionFormModal";
import { CaptionList } from "./CaptionList";
import { DeleteCaptionDialog } from "./DeleteCaptionDialog";
import { useCaptionsStore } from "./captionsStore";
import { INPUT, PRIMARY, SECONDARY } from "./captionUi";

const CHIP =
  "rounded-md px-3 py-1.5 text-sm transition-colors aria-pressed:bg-brand aria-pressed:text-white text-app-muted hover:bg-white/5 hover:text-app-text";

// The caption bank: filter by product and slot, search, add, bulk add, edit, delete.
export const CaptionsPage: React.FC = () => {
  const captions = useCaptionsStore((s) => s.captions);
  const loaded = useCaptionsStore((s) => s.loaded);
  const loadError = useCaptionsStore((s) => s.loadError);
  const load = useCaptionsStore((s) => s.load);
  const products = useProductsStore((s) => s.products);
  const loadProducts = useProductsStore((s) => s.load);

  const [product, setProduct] = useState<ProductFilter>({ kind: "all" });
  const [slot, setSlot] = useState<CaptionSlot | "all">("all");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [form, setForm] = useState<CaptionFormMode | null>(null);
  const [bulk, setBulk] = useState(false);
  const [deleting, setDeleting] = useState<Caption | null>(null);

  useEffect(() => {
    void load();
    void loadProducts();
  }, [load, loadProducts]);

  const filterProduct =
    product.kind === "product"
      ? products.find((p) => p.id === product.id)
      : undefined;
  // The filtered product was deleted or archived: show everything again.
  const filterGone =
    product.kind === "product" &&
    (!filterProduct || filterProduct.archivedAt !== null);
  useEffect(() => {
    if (filterGone && useProductsStore.getState().loaded) {
      setProduct({ kind: "all" });
    }
  }, [filterGone]);

  const shown = useMemo(
    () => filterCaptionList(captions, { slot, product, query }),
    [captions, slot, product, query],
  );
  const activeCount = selectActive(products).length;
  const filtering =
    slot !== "all" || product.kind !== "all" || query.trim() !== "";

  return (
    <div className="mt-6 flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search captions"
          aria-label="Search captions"
          className={`${INPUT} min-w-64 flex-1 bg-panel`}
        />
        <button
          type="button"
          onClick={() => setBulk(true)}
          className={SECONDARY}
        >
          Bulk add
        </button>
        <button
          type="button"
          onClick={() =>
            setForm({
              kind: "create",
              productId: product.kind === "product" ? product.id : null,
            })
          }
          className={PRIMARY}
        >
          Add caption
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div
          role="group"
          aria-label="Product filter"
          className="flex items-center gap-1"
        >
          <button
            type="button"
            aria-pressed={product.kind === "all"}
            onClick={() => setProduct({ kind: "all" })}
            className={CHIP}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={product.kind === "generic"}
            onClick={() => setProduct({ kind: "generic" })}
            className={CHIP}
          >
            Generic
          </button>
          <button
            type="button"
            aria-pressed={product.kind === "product"}
            onClick={() => setPicking(true)}
            disabled={activeCount === 0}
            className={`${CHIP} disabled:opacity-50`}
          >
            {filterProduct && !filterGone
              ? (filterProduct.shortName ?? filterProduct.fullName)
              : "Product..."}
          </button>
        </div>
        <div
          role="group"
          aria-label="Slot filter"
          className="flex items-center gap-1"
        >
          <button
            type="button"
            aria-pressed={slot === "all"}
            onClick={() => setSlot("all")}
            className={CHIP}
          >
            All slots
          </button>
          {CAPTION_SLOTS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={slot === value}
              onClick={() => setSlot(value)}
              className={CHIP}
            >
              {CAPTION_SLOT_LABELS[value]}
            </button>
          ))}
        </div>
        {loaded && captions.length > 0 && (
          <span className="text-sm text-app-dim" data-testid="caption-count">
            {shown.length === captions.length
              ? `${captions.length} ${captions.length === 1 ? "caption" : "captions"}`
              : `${shown.length} of ${captions.length}`}
          </span>
        )}
      </div>

      {loadError && (
        <p role="alert" className="mt-6 text-sm text-red-400">
          Could not load captions: {loadError}
        </p>
      )}

      {loaded && !loadError && captions.length === 0 && (
        <div className="mx-auto mt-16 flex max-w-md flex-col items-center text-center">
          <h2 className="text-lg font-medium">No captions yet</h2>
          <p className="mt-2 text-sm text-app-muted">
            A caption is the text shown over a clip. Write {"{product}"} where
            the product name goes and Sandwich fills it in. Save the lines from
            your winning videos here and pick them in the editor.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => setBulk(true)}
              className={PRIMARY}
            >
              Bulk add captions
            </button>
            <button
              type="button"
              onClick={() => setForm({ kind: "create" })}
              className={SECONDARY}
            >
              Add one
            </button>
          </div>
        </div>
      )}

      {captions.length > 0 && shown.length === 0 && filtering && (
        <p className="mt-10 text-center text-sm text-app-muted">
          No captions match these filters.
        </p>
      )}

      {shown.length > 0 && (
        <div className="mt-6">
          <CaptionList
            captions={shown}
            products={products}
            onEdit={(caption) => setForm({ kind: "edit", caption })}
            onDelete={setDeleting}
          />
        </div>
      )}

      {picking && (
        <ProductPicker
          title="Show captions for"
          onClose={() => setPicking(false)}
          onSelect={(picked) => {
            setPicking(false);
            setProduct({ kind: "product", id: picked.id });
          }}
        />
      )}
      {form && <CaptionFormModal mode={form} onClose={() => setForm(null)} />}
      {bulk && (
        <BulkAddModal
          productId={product.kind === "product" ? product.id : null}
          onClose={() => setBulk(false)}
        />
      )}
      {deleting && (
        <DeleteCaptionDialog
          caption={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
};
