import { create } from "zustand";
import type { PageId } from "./pages";

type NavState = {
  page: PageId;
  setPage: (page: PageId) => void;
};

export const useNavStore = create<NavState>((set) => ({
  page: "products",
  setPage: (page) => set({ page }),
}));
