import { useEffect, useMemo, useState } from "react";
import { groupByProduct, type VideoSummary } from "../../../shared/history";
import { useEditorStore } from "../editor/editorStore";
import { mediaThumbUrl } from "../media/mediaUrls";
import { useProductsStore } from "../products/productsStore";
import { useNavStore } from "../shell/navStore";
import { DeleteVideoDialog } from "./DeleteVideoDialog";
import { HistoryRow } from "./HistoryRow";
import { useHistoryStore } from "./historyStore";

const SECONDARY =
  "rounded-md border border-edge px-3 py-1.5 text-sm transition-colors hover:bg-white/5";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Every video of the library, grouped by product: drafts to continue, exported videos to find
// again, failed exports to retry.
export const HistoryPage: React.FC = () => {
  const products = useProductsStore((s) => s.products);
  const mediaBase = useProductsStore((s) => s.mediaBase);
  const loadProducts = useProductsStore((s) => s.load);
  const videos = useHistoryStore((s) => s.videos);
  const fileStates = useHistoryStore((s) => s.fileStates);
  const thumbs = useHistoryStore((s) => s.thumbs);
  const loadError = useHistoryStore((s) => s.error);
  const reload = useHistoryStore((s) => s.load);
  const openDraft = useEditorStore((s) => s.openDraft);
  const openDraftId = useEditorStore((s) => s.draft?.id ?? null);
  const setPage = useNavStore((s) => s.setPage);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<VideoSummary | null>(null);

  useEffect(() => {
    void loadProducts();
    void reload();
  }, [loadProducts, reload]);

  const groups = useMemo(
    () => groupByProduct(videos ?? [], products),
    [videos, products],
  );

  async function open(id: string) {
    setNotice(null);
    const result = await openDraft(id);
    if (result.ok) {
      setPage("new-video");
    } else {
      setNotice(result.message);
    }
  }

  async function reveal(id: string) {
    setNotice(null);
    try {
      const result = await window.api.videos.reveal(id);
      if (!result.ok) {
        setNotice(result.message);
        // The file is gone: refresh so the row says so.
        await reload();
      }
    } catch (caught) {
      setNotice(messageOf(caught));
    }
  }

  async function confirmDelete(
    video: VideoSummary,
    deleteFile: boolean,
  ): Promise<string | null> {
    try {
      // The open draft is closed first so its next save cannot bring the row back.
      if (openDraftId === video.id) {
        await useEditorStore.getState().closeDraft();
      }
      const result = await window.api.videos.remove(video.id, { deleteFile });
      if (!result.ok) {
        return result.message;
      }
      setNotice(result.value.warning);
      setDeleting(null);
      await reload();
      return null;
    } catch (caught) {
      return messageOf(caught);
    }
  }

  return (
    <section className="mt-6 max-w-3xl">
      {loadError && (
        <div role="alert" className="mt-3 text-sm text-red-400">
          <p className="break-words">{loadError}</p>
          <button
            type="button"
            className={`${SECONDARY} mt-2 text-app-text`}
            onClick={() => void reload()}
          >
            Try again
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="mt-3 break-words text-sm text-amber-300">
          {notice}
        </p>
      )}
      {videos === null && !loadError && (
        <p className="mt-4 text-sm text-app-muted">Loading...</p>
      )}
      {videos && videos.length === 0 && (
        <div className="mt-4">
          <p className="text-sm text-app-muted">
            No videos yet. A draft appears here as soon as you add a clip, and
            exported videos stay here.
          </p>
          <button
            type="button"
            className={`${SECONDARY} mt-3`}
            onClick={() => setPage("new-video")}
          >
            New video
          </button>
        </div>
      )}
      {groups.map((group) => (
        <section
          key={group.productId}
          aria-label={group.productName}
          className="mt-6 first:mt-4"
        >
          <h2 className="text-xs font-medium uppercase tracking-wide text-app-dim">
            {group.productName}
            {group.archived ? " (archived)" : ""}
          </h2>
          <ul aria-label={group.productName} className="mt-3 space-y-2">
            {group.videos.map((video) => {
              const thumbPath = video.beforeMediaPath
                ? thumbs[video.beforeMediaPath]
                : null;
              return (
                <HistoryRow
                  key={video.id}
                  video={video}
                  thumbUrl={
                    thumbPath ? mediaThumbUrl(mediaBase, { thumbPath }) : null
                  }
                  fileState={fileStates[video.id]}
                  platform={window.api.platform}
                  onOpen={() => void open(video.id)}
                  onReveal={() => void reveal(video.id)}
                  onDelete={() => setDeleting(video)}
                />
              );
            })}
          </ul>
        </section>
      ))}
      {deleting && (
        <DeleteVideoDialog
          video={deleting}
          fileState={fileStates[deleting.id]}
          onConfirm={(deleteFile) => confirmDelete(deleting, deleteFile)}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
  );
};
