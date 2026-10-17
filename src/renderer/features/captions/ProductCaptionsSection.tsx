import { useEffect, useMemo, useState } from "react";
import { captionsForProduct } from "../../../shared/captionSearch";
import type { CaptionSlot } from "../../../shared/captionFilter";
import { CAPTION_SLOTS } from "../../../shared/captionFilter";
import { CAPTION_SLOT_LABELS } from "../../../shared/captions";
import type { Caption } from "../../../shared/library";
import { useProductsStore } from "../products/productsStore";
import { BulkAddModal } from "./BulkAddModal";
import { CaptionFormModal, type CaptionFormMode } from "./CaptionFormModal";
import { CaptionList } from "./CaptionList";
import { CaptionPicker } from "./CaptionPicker";
import { DeleteCaptionDialog } from "./DeleteCaptionDialog";
import { useCaptionsStore } from "./captionsStore";
import { PRIMARY, SECONDARY } from "./captionUi";

// The product page's Captions tab: this product's captions plus the generic ones.
export const ProductCaptionsSection: React.FC<{ productId: string }> = ({
  productId,
}) => {
  const captions = useCaptionsStore((s) => s.captions);
  const loaded = useCaptionsStore((s) => s.loaded);
  const loadError = useCaptionsStore((s) => s.loadError);
  const load = useCaptionsStore((s) => s.load);
  const products = useProductsStore((s) => s.products);
  const [form, setForm] = useState<CaptionFormMode | null>(null);
  const [bulk, setBulk] = useState(false);
  const [deleting, setDeleting] = useState<Caption | null>(null);
  // Dev only: lets you try the picker before the editor uses it (step 3.4).
  const [pickerSlot, setPickerSlot] = useState<"before" | "after" | "broll">(
    "before",
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => captionsForProduct(captions, productId),
    [captions, productId],
  );

  return (
    <section aria-label="Captions" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-app-muted">
          This product&apos;s captions, then the generic ones every product can
          use.
        </p>
        <div className="flex items-center gap-3">
          {import.meta.env.DEV && (
            <>
              <select
                aria-label="Dev picker slot"
                value={pickerSlot}
                onChange={(event) =>
                  setPickerSlot(event.target.value as typeof pickerSlot)
                }
                className="rounded-md border border-dashed border-edge bg-transparent px-2 py-2 text-xs text-app-dim"
              >
                {CAPTION_SLOTS.filter(
                  (s): s is Exclude<CaptionSlot, "any"> => s !== "any",
                ).map((s) => (
                  <option key={s} value={s}>
                    {CAPTION_SLOT_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="rounded-md border border-dashed border-edge px-3 py-2 text-xs text-app-dim hover:text-app-text"
              >
                Dev: caption picker
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setBulk(true)}
            className={SECONDARY}
          >
            Bulk add
          </button>
          <button
            type="button"
            onClick={() => setForm({ kind: "create", productId })}
            className={PRIMARY}
          >
            Add caption
          </button>
        </div>
      </div>
      {import.meta.env.DEV && picked && (
        <p className="mt-2 text-xs text-app-dim">Picker returned: {picked}</p>
      )}

      {loadError && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          Could not load captions: {loadError}
        </p>
      )}
      {loaded && !loadError && shown.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-edge px-6 py-12 text-center">
          <h3 className="text-base font-medium">No captions yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-app-muted">
            Add captions for this product, or generic ones on the Captions page
            that work with every product.
          </p>
        </div>
      )}
      {shown.length > 0 && (
        <div className="mt-4">
          <CaptionList
            captions={shown}
            products={products}
            label="Product captions"
            onEdit={(caption) => setForm({ kind: "edit", caption })}
            onDelete={setDeleting}
          />
        </div>
      )}

      {form && <CaptionFormModal mode={form} onClose={() => setForm(null)} />}
      {bulk && (
        <BulkAddModal productId={productId} onClose={() => setBulk(false)} />
      )}
      {deleting && (
        <DeleteCaptionDialog
          caption={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
      {import.meta.env.DEV && pickerOpen && (
        <CaptionPicker
          slot={pickerSlot}
          productId={productId}
          onClose={() => setPickerOpen(false)}
          onSelect={(caption, text) => {
            setPickerOpen(false);
            setPicked(`${caption.id}: ${text}`);
          }}
        />
      )}
    </section>
  );
};
