import { useState } from "react";
import { Modal } from "../../components/Modal";
import type { Caption } from "../../../shared/library";
import { useCaptionsStore } from "./captionsStore";
import { SECONDARY } from "./captionUi";

export const DeleteCaptionDialog: React.FC<{
  caption: Caption;
  onClose: () => void;
}> = ({ caption, onClose }) => {
  const remove = useCaptionsStore((s) => s.remove);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const result = await remove(caption.id);
      if (result.ok || result.code === "not-found") {
        onClose();
      } else {
        setError(result.message);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Delete this caption?" onClose={onClose} busy={busy}>
      <p className="mt-3 whitespace-pre-wrap rounded-md bg-white/5 px-3 py-2 text-sm">
        {caption.text}
      </p>
      <p className="mt-3 text-sm text-app-muted">
        It is removed from the caption bank. Videos that already used it keep
        their text.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          autoFocus
          className={SECONDARY}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {busy ? "Deleting..." : "Delete caption"}
        </button>
      </div>
    </Modal>
  );
};
