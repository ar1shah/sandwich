import { create } from "zustand";
import type { PageId } from "./pages";

type NavState = {
  page: PageId;
  // The product whose page is open inside Products, or null for the list.
  selectedProductId: string | null;
  // Leaving Products for another page closes the open product.
  setPage: (page: PageId) => void;
  openProduct: (productId: string) => void;
  closeProduct: () => void;
};

export const useNavStore = create<NavState>((set) => ({
  page: "products",
  selectedProductId: null,
  setPage: (page) => set({ page, selectedProductId: null }),
  openProduct: (productId) =>
    set({ page: "products", selectedProductId: productId }),
  closeProduct: () => set({ selectedProductId: null }),
}));
