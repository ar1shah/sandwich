import { create } from "zustand";
import type {
  BulkAddCaptionsInput,
  CaptionResult,
  CreateCaptionInput,
  UpdateCaptionInput,
} from "../../../shared/captions";
import type { Caption } from "../../../shared/library";
import { useProductsStore } from "../products/productsStore";

type CaptionsStore = {
  // The whole bank, oldest first (the order main returns). Filter with captionSearch.
  captions: Caption[];
  loaded: boolean;
  loadError: string | null;
  load: () => Promise<void>;
  create: (input: CreateCaptionInput) => Promise<CaptionResult<Caption>>;
  update: (input: UpdateCaptionInput) => Promise<CaptionResult<Caption>>;
  remove: (id: string) => Promise<CaptionResult<true>>;
  bulkAdd: (input: BulkAddCaptionsInput) => Promise<CaptionResult<Caption[]>>;
};

export const useCaptionsStore = create<CaptionsStore>((set, get) => {
  // The product cards and the delete dialog show caption counts, so they reload after
  // every change here.
  function refreshProducts(): void {
    void useProductsStore.getState().load();
  }

  return {
    captions: [],
    loaded: false,
    loadError: null,

    async load() {
      try {
        const captions = await window.api.captions.list();
        set({ captions, loaded: true, loadError: null });
      } catch (error) {
        set({
          loaded: true,
          loadError: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async create(input) {
      const result = await window.api.captions.create(input);
      if (result.ok) {
        set((state) => ({ captions: [...state.captions, result.value] }));
        refreshProducts();
      }
      return result;
    },

    async update(input) {
      const result = await window.api.captions.update(input);
      if (result.ok) {
        set((state) => ({
          captions: state.captions.map((c) =>
            c.id === result.value.id ? result.value : c,
          ),
        }));
        refreshProducts();
      } else if (result.code === "not-found") {
        void get().load();
      }
      return result;
    },

    async remove(id) {
      const result = await window.api.captions.remove(id);
      // "not-found" means it is gone either way.
      if (result.ok || result.code === "not-found") {
        set((state) => ({
          captions: state.captions.filter((c) => c.id !== id),
        }));
        refreshProducts();
      }
      return result;
    },

    async bulkAdd(input) {
      const result = await window.api.captions.bulkAdd(input);
      if (result.ok) {
        set((state) => ({ captions: [...state.captions, ...result.value] }));
        refreshProducts();
      }
      return result;
    },
  };
});

// Deleting a product deletes its captions (cascade) and archiving one changes what the
// bank may offer, so reload the bank when a product disappears or becomes archived.
// Runs once, when this module is first imported.
useProductsStore.subscribe((state, previous) => {
  if (!useCaptionsStore.getState().loaded) {
    return;
  }
  const before = new Map(previous.products.map((p) => [p.id, p]));
  const changed =
    previous.products.some((p) => !state.products.some((n) => n.id === p.id)) ||
    state.products.some(
      (p) => p.archivedAt !== null && before.get(p.id)?.archivedAt === null,
    );
  if (changed) {
    void useCaptionsStore.getState().load();
  }
});
