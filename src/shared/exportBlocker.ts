// Why the Export button is off, in words for the user. null = the draft can be exported.
import { isRenderable, type Recipe, type Slot } from "./recipe";

export type ExportBlockerInput = {
  draft: Recipe;
  // Slots with a clip import still running.
  pendingSlots: readonly Slot[];
  // Slots whose media row or file is gone from the library.
  missingSlots: readonly Slot[];
};

export function exportBlocker({
  draft,
  pendingSlots,
  missingSlots,
}: ExportBlockerInput): string | null {
  if (pendingSlots.length > 0) {
    return "Wait for the clips to finish importing.";
  }
  if (missingSlots.length > 0) {
    return "A clip's file is missing. Replace it before exporting.";
  }
  if (!isRenderable(draft)) {
    return "Add a clip to every slot before exporting.";
  }
  return null;
}
