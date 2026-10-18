import { LoadError } from "../../components/LoadError";
import { useEffect, useMemo, useState } from "react";
import { filterProducts, orderProducts } from "../../../shared/productSearch";
import type { ProductSummary } from "../../../shared/products";
import { DeleteProductDialog } from "./DeleteProductDialog";
import { PRODUCT_GRID_CLASS, ProductCard } from "./ProductCard";
import { ProductFormModal, type ProductFormMode } from "./ProductFormModal";
import { ProductPicker } from "./ProductPicker";
import { productImageUrl } from "./productImageUrl";
import { useNavStore } from "../shell/navStore";
import { selectActive, useProductsStore } from "./productsStore";

const PRIMARY =
  "rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90";

export const ProductsPage: React.FC = () => {
  const products = useProductsStore((s) => s.products);
  const loaded = useProductsStore((s) => s.loaded);
  const loadError = useProductsStore((s) => s.loadError);
  const mediaBase = useProductsStore((s) => s.mediaBase);
  const load = useProductsStore((s) => s.load);
  const touchLastUsed = useProductsStore((s) => s.touchLastUsed);
  const openProduct = useNavStore((s) => s.openProduct);

  const [query, setQuery] = useState("");
  const [form, setForm] = useState<ProductFormMode | null>(null);
  const [deleting, setDeleting] = useState<ProductSummary | null>(null);
  // Dev only: lets you try the picker before the editor uses it (step 3.1).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(() => selectActive(products), [products]);
  const shown = useMemo(
    () => orderProducts(filterProducts(active, query)),
    [active, query],
  );
  const searching = query.trim() !== "";
  // "Recent" only when something was actually used; the order already puts those first.
  const recent = searching ? [] : shown.filter((p) => p.lastUsedAt !== null);
  const rest = searching ? shown : shown.filter((p) => p.lastUsedAt === null);

  const grid = (items: ProductSummary[]) => (
    <ul className={PRODUCT_GRID_CLASS}>
      {items.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          imageUrl={productImageUrl(mediaBase, product)}
          onSelect={() => openProduct(product.id)}
          onEdit={() => setForm({ kind: "edit", product })}
          onDelete={() => setDeleting(product)}
        />
      ))}
    </ul>
  );

  return (
    <div className="mt-6 flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products"
          aria-label="Search products"
          className="min-w-64 flex-1 rounded-md border border-edge bg-panel px-3 py-2 text-sm outline-none placeholder:text-app-dim focus:border-brand"
        />
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-md border border-dashed border-edge px-3 py-2 text-xs text-app-dim hover:text-app-text"
          >
            Dev: product picker
          </button>
        )}
        <button
          type="button"
          onClick={() => setForm({ kind: "create" })}
          className={PRIMARY}
        >
          Add product
        </button>
      </div>
      {import.meta.env.DEV && picked && (
        <p className="mt-2 text-xs text-app-dim">Picker returned: {picked}</p>
      )}

      {!loaded && !loadError && (
        <p className="mt-6 text-sm text-app-muted">Loading products...</p>
      )}
      {loadError && (
        <LoadError
          message={`Could not load products: ${loadError}`}
          onRetry={() => void load()}
        />
      )}

      {loaded && !loadError && active.length === 0 && (
        <div className="mx-auto mt-16 flex max-w-md flex-col items-center text-center">
          <h2 className="text-lg font-medium">No products yet</h2>
          <p className="mt-2 text-sm text-app-muted">
            A product is the thing you sell, like a pair of jeans. Pick one when
            you make a video and Sandwich shows only its b-roll and captions.
          </p>
          <button
            type="button"
            onClick={() => setForm({ kind: "create" })}
            className={`${PRIMARY} mt-5`}
          >
            Add your first product
          </button>
        </div>
      )}

      {active.length > 0 && shown.length === 0 && (
        <p className="mt-10 text-center text-sm text-app-muted">
          No products match &ldquo;{query.trim()}&rdquo;.
        </p>
      )}

      {recent.length > 0 && (
        <section className="mt-6" aria-label="Recent products">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-app-dim">
            Recent
          </h2>
          {grid(recent)}
        </section>
      )}
      {rest.length > 0 && (
        <section className="mt-6" aria-label="Products">
          {recent.length > 0 && (
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-app-dim">
              All products
            </h2>
          )}
          {grid(rest)}
        </section>
      )}

      {form && <ProductFormModal mode={form} onClose={() => setForm(null)} />}
      {deleting && (
        <DeleteProductDialog
          product={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
      {import.meta.env.DEV && pickerOpen && (
        <ProductPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(product) => {
            setPickerOpen(false);
            setPicked(product.fullName);
            // What a real consumer does on pick: it sorts first next time.
            void touchLastUsed(product.id);
          }}
        />
      )}
    </div>
  );
};
