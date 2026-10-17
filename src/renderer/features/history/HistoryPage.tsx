import { useCallback, useEffect, useState } from "react";
import { summarizeDraft, type DraftSummary } from "../../../shared/drafts";
import { formatDuration } from "../../../shared/formatDuration";
import { Modal } from "../../components/Modal";
import { useEditorStore } from "../editor/editorStore";
import { useProductsStore } from "../products/productsStore";
import { useNavStore } from "../shell/navStore";

const SECONDARY =
  "rounded-md border border-edge px-3 py-1.5 text-sm transition-colors hover:bg-white/5";

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

// Stub for step 3.6: lists drafts so nothing is lost when the editor is closed. Exported
// videos are added later.
export const HistoryPage: React.FC = () => {
  const products = useProductsStore((s) => s.products);
  const loadProducts = useProductsStore((s) => s.load);
  const openDraft = useEditorStore((s) => s.openDraft);
  const closeDraftIfOpen = useEditorStore((s) => s.draft?.id ?? null);
  const setPage = useNavStore((s) => s.setPage);
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DraftSummary | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await window.api.videos.list({ status: "draft" });
      setDrafts(rows.map(summarizeDraft));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void reload();
  }, [loadProducts, reload]);

  async function open(id: string) {
    const result = await openDraft(id);
    if (result.ok) {
      setPage("new-video");
    } else {
      setError(result.message);
    }
  }

  async function confirmDelete(draft: DraftSummary) {
    // The open draft is closed first so its next save cannot bring the row back.
    if (closeDraftIfOpen === draft.id) {
      await useEditorStore.getState().closeDraft();
    }
    const result = await window.api.videos.remove(draft.id);
    if (!result.ok) {
      setError(result.message);
    }
    setDeleting(null);
    await reload();
  }

  const nameOf = (productId: string) =>
    products.find((p) => p.id === productId)?.fullName ?? "Unknown product";

  return (
    <section className="mt-6 max-w-3xl">
      <h2 className="text-xs font-medium uppercase tracking-wide text-app-dim">
        Drafts
      </h2>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {drafts && drafts.length === 0 && (
        <p className="mt-4 text-sm text-app-muted">
          No drafts yet. A draft appears here as soon as you add a clip.
        </p>
      )}
      {drafts && drafts.length > 0 && (
        <ul aria-label="Drafts" className="mt-4 space-y-2">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              data-testid="draft-row"
              className="flex items-center gap-3 rounded-xl border border-edge bg-panel px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {draft.readable
                    ? nameOf(draft.productId)
                    : "Unreadable draft"}
                </p>
                <p className="text-xs text-app-muted">
                  {draft.readable
                    ? `${draft.filledSlots} of 3 clips · ${formatDuration(draft.totalDuration)} · `
                    : `${nameOf(draft.productId)} · `}
                  {when(draft.updatedAt)}
                </p>
              </div>
              {draft.readable && (
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => void open(draft.id)}
                >
                  Open
                </button>
              )}
              <button
                type="button"
                className={SECONDARY}
                onClick={() => setDeleting(draft)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {deleting && (
        <Modal
          title="Delete draft"
          onClose={() => setDeleting(null)}
          widthClass="max-w-md"
        >
          <p className="mt-3 text-sm text-app-muted">
            This draft is deleted. Your clips stay in the library. This
            can&apos;t be undone.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              autoFocus
              className={SECONDARY}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              onClick={() => void confirmDelete(deleting)}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
};
