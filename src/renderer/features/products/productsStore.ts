import { create } from "zustand";
import type {
  CreateProductRequest,
  ProductResult,
  ProductSummary,
  UpdateProductRequest,
} from "../../../shared/products";

type ProductsStore = {
  // Every product including archived ones (their slugs still count). Use selectActive.
  products: ProductSummary[];
  loaded: boolean;
  loadError: string | null;
  mediaBase: string | null;
  load: () => Promise<void>;
  create: (
    input: CreateProductRequest,
  ) => Promise<ProductResult<ProductSummary>>;
  update: (
    input: UpdateProductRequest,
  ) => Promise<ProductResult<ProductSummary>>;
  remove: (id: string) => Promise<ProductResult<true>>;
  archive: (id: string) => Promise<ProductResult<ProductSummary>>;
  touchLastUsed: (id: string) => Promise<ProductResult<ProductSummary>>;
};

export function selectActive(products: readonly ProductSummary[]) {
  return products.filter((product) => product.archivedAt === null);
}

function upsert(
  products: ProductSummary[],
  next: ProductSummary,
): ProductSummary[] {
  return products.some((p) => p.id === next.id)
    ? products.map((p) => (p.id === next.id ? next : p))
    : [...products, next];
}

export const useProductsStore = create<ProductsStore>((set, get) => {
  // Applies a changed product to the list when the call worked.
  async function applying(
    call: Promise<ProductResult<ProductSummary>>,
  ): Promise<ProductResult<ProductSummary>> {
    const result = await call;
    if (result.ok) {
      set((state) => ({ products: upsert(state.products, result.value) }));
    }
    return result;
  }

  return {
    products: [],
    loaded: false,
    loadError: null,
    mediaBase: null,

    async load() {
      try {
        const [products, mediaBase] = await Promise.all([
          window.api.products.list(),
          get().mediaBase ?? window.api.library.mediaBaseUrl(),
        ]);
        set({ products, mediaBase, loaded: true, loadError: null });
      } catch (error) {
        set({
          loaded: true,
          loadError: error instanceof Error ? error.message : String(error),
        });
      }
    },

    create: (input) => applying(window.api.products.create(input)),
    update: (input) => applying(window.api.products.update(input)),
    archive: (id) => applying(window.api.products.archive(id)),
    touchLastUsed: (id) => applying(window.api.products.touchLastUsed(id)),

    async remove(id) {
      const result = await window.api.products.remove(id);
      if (result.ok) {
        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
        }));
      }
      return result;
    },
  };
});
