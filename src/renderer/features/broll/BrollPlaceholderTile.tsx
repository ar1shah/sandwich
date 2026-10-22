import type { BrollPlaceholder } from "../../../shared/brollPlaceholders";

// A tile for an import that has not produced a clip yet: progress while it runs, an error
// (kept until dismissed) if it failed.
export const BrollPlaceholderTile: React.FC<{
  placeholder: BrollPlaceholder;
  onCancel: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
  // Imports the same file again. Omitted when the file is not known.
  onRetry?: (jobId: string) => void;
}> = ({ placeholder, onCancel, onDismiss, onRetry }) => {
  const fileName = placeholder.label.replace(/^Importing /, "");

  if (placeholder.kind === "error") {
    return (
      <li
        data-testid="broll-placeholder-error"
        className="flex aspect-[9/16] flex-col justify-between rounded-xl border border-red-500/40 bg-red-500/5 p-3"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium text-red-300">Import failed</p>
          <p className="mt-1 truncate text-xs text-app-muted" title={fileName}>
            {fileName}
          </p>
          <p role="alert" className="mt-2 line-clamp-4 text-xs text-app-muted">
            {placeholder.message}
          </p>
        </div>
        <div className="flex gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry(placeholder.jobId)}
              className="rounded-md border border-edge px-2 py-1 text-xs hover:bg-white/5"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(placeholder.jobId)}
            className="rounded-md border border-edge px-2 py-1 text-xs hover:bg-white/5"
          >
            Dismiss
          </button>
        </div>
      </li>
    );
  }

  const status = placeholder.queued
    ? "Waiting"
    : (placeholder.stage ?? "Starting");
  return (
    <li
      data-testid="broll-placeholder"
      className="flex aspect-[9/16] flex-col justify-between rounded-xl border border-edge bg-panel p-3"
    >
      <div className="min-w-0">
        <p className="truncate text-xs text-app-muted" title={fileName}>
          {fileName}
        </p>
        <p className="mt-1 text-xs text-app-dim">{status}</p>
      </div>
      <div>
        <div
          role="progressbar"
          aria-label={`Importing ${fileName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(placeholder.percent)}
          className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        >
          <div
            className="h-full bg-brand transition-[width]"
            style={{ width: `${placeholder.percent}%` }}
          />
        </div>
        {placeholder.stage !== "Finishing" && (
          <button
            type="button"
            onClick={() => onCancel(placeholder.jobId)}
            className="mt-2 rounded-md border border-edge px-2 py-1 text-xs hover:bg-white/5"
          >
            Cancel
          </button>
        )}
      </div>
    </li>
  );
};
