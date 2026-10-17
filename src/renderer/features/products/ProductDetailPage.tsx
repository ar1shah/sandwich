import { useEffect, useState } from "react";
import { BrollPicker } from "../broll/BrollPicker";
import { BrollSection } from "../broll/BrollSection";
import { watchBrollImports } from "../broll/brollStore";
import { useNavStore } from "../shell/navStore";
import { ProductFormModal } from "./ProductFormModal";
import { productImageUrl } from "./productImageUrl";
import { initials, tint } from "./ProductCard";
import { useProductsStore } from "./productsStore";

// One product: its photo and names, and its b-roll library.
export const ProductDetailPage: React.FC<{ productId: string }> = ({
  productId,
}) => {
  const products = useProductsStore((s) => s.products);
  const loaded = useProductsStore((s) => s.loaded);
  const mediaBase = useProductsStore((s) => s.mediaBase);
  const load = useProductsStore((s) => s.load);
  const closeProduct = useNavStore((s) => s.closeProduct);
  const [editing, setEditing] = useState(false);
  // Dev only: lets you try the picker before the editor uses it (step 3.1).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const product = products.find((p) => p.id === productId);
  const archived = product?.archivedAt != null;

  useEffect(() => {
    void load();
  }, [load]);

  // Reloads the b-roll list (and the card counts) when an import for any product finishes.
  useEffect(() => watchBrollImports(), []);

  // Deleted or archived while open: nothing to show, go back to the list.
  useEffect(() => {
    if (loaded && (!product || archived)) {
      closeProduct();
    }
  }, [loaded, product, archived, closeProduct]);

  if (!product || archived) {
    return null;
  }

  const imageUrl = productImageUrl(mediaBase, product);

  return (
    <div className="flex flex-1 flex-col">
      <button
        type="button"
        onClick={closeProduct}
        className="mb-4 self-start text-sm text-app-muted hover:text-app-text"
      >
        &larr; All products
      </button>

      <header className="flex items-center gap-5">
        <div className="size-24 shrink-0 overflow-hidden rounded-xl border border-edge bg-black/30">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white/70"
              style={{ background: tint(product.fullName) }}
            >
              {initials(product.fullName)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {product.fullName}
          </h1>
          {product.shortName && (
            <p className="mt-1 text-sm text-app-muted">{product.shortName}</p>
          )}
        </div>
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-md border border-dashed border-edge px-3 py-2 text-xs text-app-dim hover:text-app-text"
          >
            Dev: b-roll picker
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md border border-edge px-4 py-2 text-sm hover:bg-white/5"
        >
          Edit product
        </button>
      </header>
      {import.meta.env.DEV && picked && (
        <p className="mt-2 text-xs text-app-dim">Picker returned: {picked}</p>
      )}

      <BrollSection productId={productId} mediaBase={mediaBase} />

      {editing && (
        <ProductFormModal
          mode={{ kind: "edit", product }}
          onClose={() => setEditing(false)}
        />
      )}
      {import.meta.env.DEV && pickerOpen && (
        <BrollPicker
          productId={productId}
          onClose={() => setPickerOpen(false)}
          onSelect={(media) => {
            setPickerOpen(false);
            setPicked(media.originalName ?? media.id);
          }}
        />
      )}
    </div>
  );
};
