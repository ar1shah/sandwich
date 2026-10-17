import { useState } from "react";
import { Modal } from "../../components/Modal";
import type { Media } from "../../../shared/library";
import { brollTileLabel } from "./BrollTile";
import { useBrollStore } from "./brollStore";

export const DeleteBrollDialog: React.FC<{
  media: Media;
  onClose: () => void;
}> = ({ media, onClose }) => {
  const remove = useBrollStore((s) => s.remove);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await remove(media);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Delete b-roll"
      onClose={onClose}
      busy={busy}
      widthClass="max-w-md"
    >
      <div className="mt-3 space-y-3 text-sm text-app-muted">
        <p>
          <span className="font-medium text-app-text">
            {brollTileLabel(media)}
          </span>
        </p>
        <p>
          The clip is deleted from your library folder. Your original file is
          not touched. This can&apos;t be undone.
        </p>
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
          className="rounded-md border border-edge px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {busy ? "Deleting..." : "Delete b-roll"}
        </button>
      </div>
    </Modal>
  );
};
