import { create } from "zustand";
import type { Slot } from "../../../shared/recipe";

// Where the preview should jump to: the first frame of a slot's clip (the default), its
// last frame (`edge: 'end'`, used by the trim drag on the right handle), or an arbitrary
// frame. The panel resolves slots against its own timeline, so callers never do frame math.
export type SeekTarget =
  | { slot: Slot; edge?: "start" | "end" }
  | { frame: number };

// `pause` stops playback first, so a drag does not fight a playing preview.
// `onlyIfOutside` (slot targets only) skips the seek when the playhead is already inside
// that slot's clip: a caption look change then shows up where you are looking. The panel
// decides with the Player's own current frame, which is never kept in a store.
export type SeekRequest = {
  target: SeekTarget;
  pause: boolean;
  onlyIfOutside: boolean;
  nonce: number;
};

export type SeekOptions = { pause?: boolean; onlyIfOutside?: boolean };

export type PreviewStore = {
  seekRequest: SeekRequest | null;
  requestSeek: (target: SeekTarget, options?: SeekOptions) => void;
};

// The nonce makes asking for the same target twice (click the same slot again) a new
// request, so the panel seeks again.
export const usePreviewStore = create<PreviewStore>((set, get) => ({
  seekRequest: null,
  requestSeek(target, options) {
    set({
      seekRequest: {
        target,
        pause: options?.pause === true,
        onlyIfOutside: options?.onlyIfOutside === true,
        nonce: (get().seekRequest?.nonce ?? 0) + 1,
      },
    });
  },
}));
