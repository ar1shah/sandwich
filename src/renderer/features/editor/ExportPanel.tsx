import { useState } from "react";
import { showInFileManagerLabel } from "../../../shared/platform";
import { Modal } from "../../components/Modal";
import { useJobsStore } from "../jobs/jobsStore";
import { useEditorStore } from "./editorStore";

const Progress: React.FC<{ jobId: string | null }> = ({ jobId }) => {
  const job = useJobsStore((s) => (jobId ? s.jobs[jobId] : undefined));
  const queued = !job || job.state === "queued";
  const percent = queued ? 0 : Math.round(job.percent);
  const stage = !job
    ? "Starting"
    : job.state === "queued"
      ? "Waiting for the renderer"
      : job.state === "cancelling"
        ? "Cancelling"
        : (job.stage ?? "Working");
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs text-app-muted">
        <span>{stage}</span>
        {!queued && <span>{percent}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label="Export progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={queued ? undefined : percent}
        className="mt-1.5 h-2 overflow-hidden rounded bg-white/10"
      >
        <div className="h-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};

const buttonClass =
  "rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50";
const primaryClass =
  "rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

// Shown over the editor from the click on Export until the user leaves it. While it is open
// the draft cannot change (the store locks it too).
export const ExportPanel: React.FC = () => {
  const exportState = useEditorStore((s) => s.exportState);
  const draft = useEditorStore((s) => s.draft);
  const cancelExport = useEditorStore((s) => s.cancelExport);
  const dismissExport = useEditorStore((s) => s.dismissExport);
  const finishExport = useEditorStore((s) => s.finishExport);
  const newVideoSameProduct = useEditorStore((s) => s.newVideoSameProduct);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const platform = window.api.platform;

  if (exportState.kind === "idle") {
    return null;
  }

  if (exportState.kind === "starting" || exportState.kind === "running") {
    const jobId = exportState.kind === "running" ? exportState.jobId : null;
    return (
      <Modal title="Exporting your video" onClose={() => undefined} busy>
        <p className="mt-2 text-sm text-app-muted">
          This takes a minute or two. You can leave this window open and keep
          using other apps.
        </p>
        <Progress jobId={jobId} />
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={cancelExport}
            disabled={exportState.kind === "starting"}
            className={buttonClass}
          >
            Cancel export
          </button>
        </div>
      </Modal>
    );
  }

  if (exportState.kind === "failed") {
    const details = [
      `Export failed: ${exportState.message}`,
      "",
      "Recipe:",
      JSON.stringify(draft, null, 2),
    ].join("\n");
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(details);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    };
    return (
      <Modal title="The export did not work" onClose={dismissExport}>
        <p role="alert" className="mt-2 break-words text-sm text-red-400">
          {exportState.message}
        </p>
        <p className="mt-2 text-xs text-app-dim">
          Your draft is safe. Go back to editing and try again.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className={buttonClass}
          >
            {copied ? "Copied" : "Copy details"}
          </button>
          <button
            type="button"
            onClick={dismissExport}
            className={primaryClass}
          >
            Back to editing
          </button>
        </div>
      </Modal>
    );
  }

  const reveal = async () => {
    setRevealError(null);
    const result = await window.api.videos.reveal(exportState.videoId);
    if (!result.ok) {
      setRevealError(result.message);
    }
  };

  return (
    <Modal
      title="Your video is ready"
      onClose={() => void finishExport()}
      widthClass="max-w-xl"
    >
      <p className="mt-2 break-all text-sm" data-testid="export-file-name">
        {exportState.fileName}
      </p>
      {exportState.warnings.length > 0 && (
        <div className="mt-3 rounded-md border border-edge bg-white/5 px-3 py-2">
          <p className="text-xs font-medium text-app-muted">
            Exported, but a check was not sure:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-app-muted">
            {exportState.warnings.map((warning) => (
              <li key={warning} className="break-words">
                {warning}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-app-dim">
            Watch the video once before you post it.
          </p>
        </div>
      )}
      {revealError && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {revealError}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => void reveal()}
          className={buttonClass}
        >
          {showInFileManagerLabel(platform)}
        </button>
        <button
          type="button"
          onClick={() => void finishExport()}
          className={buttonClass}
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => void newVideoSameProduct()}
          className={primaryClass}
          autoFocus
        >
          New video, same product
        </button>
      </div>
    </Modal>
  );
};
