import { create } from "zustand";
import type {
  LibraryCandidate,
  LibraryChooseSource,
  LibraryState,
} from "../../../shared/library";

type LibraryStore = {
  // null while the first get() is in flight.
  state: LibraryState | null;
  // Folder main inspected and is holding for activate().
  candidate: LibraryCandidate | null;
  busy: boolean;
  error: string | null;
  load: () => Promise<void>;
  choose: (source: LibraryChooseSource) => Promise<void>;
  activate: (useChosenFolder?: boolean) => Promise<void>;
  cancel: () => void;
};

// Electron prefixes handler errors: "Error invoking remote method 'x': Error: message".
function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  state: null,
  candidate: null,
  busy: false,
  error: null,

  async load() {
    try {
      set({ state: await window.api.library.get(), error: null });
    } catch (error) {
      set({ error: messageOf(error) });
    }
  },

  async choose(source) {
    if (get().busy) {
      return;
    }
    set({ busy: true, error: null });
    try {
      // null = dialog cancelled: keep whatever was showing.
      const candidate = await window.api.library.choose(source);
      set(candidate ? { candidate } : {});
    } catch (error) {
      set({ error: messageOf(error) });
    } finally {
      set({ busy: false });
    }
  },

  async activate(useChosenFolder = false) {
    if (get().busy) {
      return;
    }
    set({ busy: true, error: null });
    try {
      const state = await window.api.library.activate(
        useChosenFolder ? { useChosenFolder: true } : undefined,
      );
      set({ state, candidate: null });
    } catch (error) {
      set({ error: messageOf(error) });
    } finally {
      set({ busy: false });
    }
  },

  cancel() {
    set({ candidate: null, error: null });
  },
}));
