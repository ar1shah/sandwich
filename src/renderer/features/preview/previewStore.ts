import { create } from "zustand";
import type { Slot } from "../../../shared/recipe";

// Where the preview should jump to: the start of a slot's clip, or an arbitrary frame
// (the trim drag in 3.3 uses the frame form).
export type SeekTarget = { slot: Slot } | { frame: number };

export type SeekRequest = { target: SeekTarget; nonce: number };

export type PreviewStore = {
  seekRequest: SeekRequest | null;
  requestSeek: (target: SeekTarget) => void;
};

// The nonce makes asking for the same target twice (click the same slot again) a new
// request, so the panel seeks again.
export const usePreviewStore = create<PreviewStore>((set, get) => ({
  seekRequest: null,
  requestSeek(target) {
    set({
      seekRequest: { target, nonce: (get().seekRequest?.nonce ?? 0) + 1 },
    });
  },
}));
