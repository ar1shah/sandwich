import { create } from "zustand";
import type { BrollResult } from "../../../shared/broll";
import { debounce } from "../../../shared/debounce";
import type { Media } from "../../../shared/library";
import { useJobsStore } from "../jobs/jobsStore";
import { useProductsStore } from "../products/productsStore";

// A 10-file import finishes ten jobs within moments: reload once, not ten times.
export const REFRESH_DEBOUNCE_MS = 300;

type ProductBroll = { items: Media[]; loaded: boolean; error: string | null };

const EMPTY: ProductBroll = { items: [], loaded: false, error: null };

type BrollStore = {
  byProduct: Record<string, ProductBroll>;
  load: (productId: string) => Promise<void>;
  // Deletes the clip and its files. A "not-found" result still drops it from the list: it
  // is gone either way.
  remove: (media: Media) => Promise<BrollResult<true>>;
  // Debounced: reloads this product's list and the product counts on the cards.
  refreshSoon: (productId: string) => void;
};

export function selectProductBroll(
  state: Pick<BrollStore, "byProduct">,
  productId: string,
): ProductBroll {
  return state.byProduct[productId] ?? EMPTY;
}

export const useBrollStore = create<BrollStore>((set, get) => {
  const pending = new Set<string>();
  const latest = new Map<string, number>();

  const flush = debounce(() => {
    const ids = [...pending];
    pending.clear();
    void Promise.all([
      ...ids.map((id) => get().load(id)),
      useProductsStore.getState().load(),
    ]);
  }, REFRESH_DEBOUNCE_MS);

  return {
    byProduct: {},

    async load(productId) {
      const ticket = (latest.get(productId) ?? 0) + 1;
      latest.set(productId, ticket);
      try {
        const items = await window.api.broll.list(productId);
        if (latest.get(productId) !== ticket) {
          return;
        }
        set((state) => ({
          byProduct: {
            ...state.byProduct,
            [productId]: { items, loaded: true, error: null },
          },
        }));
      } catch (error) {
        if (latest.get(productId) !== ticket) {
          return;
        }
        set((state) => ({
          byProduct: {
            ...state.byProduct,
            [productId]: {
              items: state.byProduct[productId]?.items ?? [],
              loaded: true,
              error: error instanceof Error ? error.message : String(error),
            },
          },
        }));
      }
    },

    async remove(media) {
      const result = await window.api.broll.remove(media.id);
      if (media.productId) {
        const productId = media.productId;
        set((state) => {
          const current = state.byProduct[productId] ?? EMPTY;
          return {
            byProduct: {
              ...state.byProduct,
              [productId]: {
                ...current,
                items: current.items.filter((item) => item.id !== media.id),
              },
            },
          };
        });
        get().refreshSoon(productId);
      }
      return result;
    },

    refreshSoon(productId) {
      pending.add(productId);
      flush();
    },
  };
});

// Calls refreshSoon when an import for a product finishes. Returns the unsubscribe.
export function watchBrollImports(): () => void {
  return useJobsStore.subscribe((state, previous) => {
    for (const job of Object.values(state.jobs)) {
      if (
        job.state === "done" &&
        job.productId &&
        previous.jobs[job.id]?.state !== "done"
      ) {
        useBrollStore.getState().refreshSoon(job.productId);
      }
    }
  });
}
