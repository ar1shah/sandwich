import { useState } from "react";
import { Modal } from "../../components/Modal";
import type { ProductSummary } from "../../../shared/products";
import { useProductsStore } from "./productsStore";

const SECONDARY =
  "rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// Hard delete, or archive when the product has exported videos (they cannot be deleted
// with it). The counts come from the list, so they match what the database will remove.
export const DeleteProductDialog: React.FC<{
  product: ProductSummary;
  onClose: () => void;
}> = ({ product, onClose }) => {
  const removeProduct = useProductsStore((s) => s.remove);
  const archiveProduct = useProductsStore((s) => s.archive);
  const [archiveInstead, setArchiveInstead] = useState(product.videoCount > 0);
  const [videoCount, setVideoCount] = useState(product.videoCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "delete" | "archive") {
    setBusy(true);
    setError(null);
    try {
      const result =
        action === "delete"
          ? await removeProduct(product.id)
          : await archiveProduct(product.id);
      if (result.ok) {
        onClose();
      } else if (result.code === "has-videos") {
        // Videos appeared since the list loaded.
        setVideoCount(result.videoCount ?? 1);
        setArchiveInstead(true);
      } else {
        setError(result.message);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const dependents: string[] = [];
  if (product.brollCount > 0) {
    dependents.push(plural(product.brollCount, "b-roll clip", "b-roll clips"));
  }
  if (product.captionCount > 0) {
    dependents.push(plural(product.captionCount, "caption", "captions"));
  }

  return (
    <Modal
      title={archiveInstead ? "Archive product" : "Delete product"}
      onClose={onClose}
      busy={busy}
      widthClass="max-w-md"
    >
      <div className="mt-3 space-y-3 text-sm text-app-muted">
        <p>
          <span className="font-medium text-app-text">{product.fullName}</span>
        </p>
        {archiveInstead ? (
          <p>
            This product has{" "}
            {plural(videoCount, "exported video", "exported videos")}, so it
            can&apos;t be deleted. Archiving hides it from your lists and keeps
            your videos and history.
          </p>
        ) : dependents.length > 0 ? (
          <p>
            This also deletes {dependents.join(" and ")} for this product. This
            can&apos;t be undone.
          </p>
        ) : (
          <p>
            Its photo is deleted too. No b-roll or captions depend on it. This
            can&apos;t be undone.
          </p>
        )}
        {error && (
          <p role="alert" className="text-red-400">
            {error}
          </p>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          autoFocus
          className={SECONDARY}
        >
          Cancel
        </button>
        {archiveInstead ? (
          <button
            type="button"
            onClick={() => void run("archive")}
            disabled={busy}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Archiving..." : "Archive product"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void run("delete")}
            disabled={busy}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? "Deleting..." : "Delete product"}
          </button>
        )}
      </div>
    </Modal>
  );
};
