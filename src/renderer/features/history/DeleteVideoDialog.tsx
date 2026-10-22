import { useState } from "react";
import type { VideoSummary } from "../../../shared/history";
import type { ExportFileState } from "../../../shared/videos";
import { Modal } from "../../components/Modal";

const SECONDARY =
  "rounded-md border border-edge px-3 py-1.5 text-sm transition-colors hover:bg-white/5";

type Props = {
  video: VideoSummary;
  fileState: ExportFileState | undefined;
  // Resolves with an error message to show here, or null when the record is gone.
  onConfirm: (deleteFile: boolean) => Promise<string | null>;
  onClose: () => void;
};

export const DeleteVideoDialog: React.FC<Props> = ({
  video,
  fileState,
  onConfirm,
  onClose,
}) => {
  const exported = video.status === "exported";
  const hasFile = exported && fileState !== "missing";
  const [deleteFile, setDeleteFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const message = await onConfirm(hasFile && deleteFile);
    if (message !== null) {
      setError(message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={exported ? "Delete from history" : "Delete draft"}
      onClose={onClose}
      widthClass="max-w-md"
      busy={busy}
    >
      <p className="mt-3 text-sm text-app-muted">
        {exported
          ? "This removes the video from History."
          : "This draft is deleted. Your clips stay in the library."}{" "}
        This can&apos;t be undone.
      </p>
      {hasFile && (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={deleteFile}
            disabled={busy}
            onChange={(event) => setDeleteFile(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Also move the video file to the Trash
            <span className="block text-xs text-app-dim">
              If you leave this off, the video file and its recipe file stay in
              your exports folder.
            </span>
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="mt-3 break-words text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          autoFocus
          disabled={busy}
          className={SECONDARY}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          onClick={() => void confirm()}
        >
          {error ? "Try again" : "Delete"}
        </button>
      </div>
    </Modal>
  );
};
