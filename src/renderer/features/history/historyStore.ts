import { create } from "zustand";
import { summarizeVideo, type VideoSummary } from "../../../shared/history";
import { isUsableMedia } from "../../../shared/mediaLookup";
import type { ExportFileState } from "../../../shared/videos";

type HistoryStore = {
  // null until the first load has answered.
  videos: VideoSummary[] | null;
  // Exported rows only: is the mp4 still on disk?
  fileStates: Record<string, ExportFileState>;
  // Library-relative thumbnail of each row's Before clip, by the clip's path. A path that is
  // missing from the map (or null) has no thumbnail.
  thumbs: Record<string, string | null>;
  error: string | null;
  load: () => Promise<void>;
};

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']*': (Error: )?/, "");
}

export const useHistoryStore = create<HistoryStore>((set) => ({
  videos: null,
  fileStates: {},
  thumbs: {},
  error: null,
  async load() {
    try {
      const rows = await window.api.videos.list();
      const videos = rows.map(summarizeVideo);
      const beforePaths = [
        ...new Set(
          videos.flatMap((v) => (v.beforeMediaPath ? [v.beforeMediaPath] : [])),
        ),
      ];
      const exportedIds = videos
        .filter((v) => v.status === "exported")
        .map((v) => v.id);
      // One call each for every row, never one per row.
      const [checks, fileStates] = await Promise.all([
        beforePaths.length > 0
          ? window.api.media.byPaths(beforePaths)
          : Promise.resolve([]),
        exportedIds.length > 0
          ? window.api.videos.exportFiles(exportedIds)
          : Promise.resolve({}),
      ]);
      const thumbs: Record<string, string | null> = {};
      for (const check of checks) {
        // A clip whose file is gone has no thumbnail worth showing either.
        thumbs[check.path] = isUsableMedia(check)
          ? (check.media?.thumbPath ?? null)
          : null;
      }
      set({ videos, fileStates, thumbs, error: null });
    } catch (caught) {
      set({ error: messageOf(caught) });
    }
  },
}));
