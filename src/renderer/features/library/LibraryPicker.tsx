import { SYNC_PROVIDER_LABELS } from "../../../shared/syncedFolders";
import { useLibraryStore } from "./libraryStore";

const PRIMARY =
  "rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
const SECONDARY =
  "rounded-md border border-edge px-4 py-2 text-sm text-app-text transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40";

const Notice: React.FC<{
  tone: "warning" | "error" | "info";
  children: React.ReactNode;
}> = ({ tone, children }) => {
  const styles = {
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    error: "border-red-500/40 bg-red-500/10 text-red-200",
    info: "border-edge bg-white/5 text-app-muted",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={`rounded-md border px-4 py-3 text-sm ${styles}`}
    >
      {children}
    </div>
  );
};

// Pick a folder, review what main found there, confirm. Shared by the welcome screen and
// Settings > Switch library. Nothing is opened until the user confirms.
export const LibraryPicker: React.FC<{
  // Offered as a one-click choice (first launch). Omit to only offer the folder dialog.
  defaultPath?: string;
}> = ({ defaultPath }) => {
  const candidate = useLibraryStore((s) => s.candidate);
  const busy = useLibraryStore((s) => s.busy);
  const error = useLibraryStore((s) => s.error);
  const choose = useLibraryStore((s) => s.choose);
  const activate = useLibraryStore((s) => s.activate);
  const cancel = useLibraryStore((s) => s.cancel);

  if (!candidate) {
    return (
      <div className="flex flex-col gap-4">
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap gap-3">
          {defaultPath && (
            <button
              type="button"
              className={PRIMARY}
              disabled={busy}
              onClick={() => void choose("default")}
            >
              Use the default folder
            </button>
          )}
          <button
            type="button"
            className={defaultPath ? SECONDARY : PRIMARY}
            disabled={busy}
            onClick={() => void choose("dialog")}
          >
            Choose another folder
          </button>
        </div>
        {defaultPath && (
          <p className="break-all text-xs text-app-dim">
            Default: {defaultPath}
          </p>
        )}
      </div>
    );
  }

  const newSubfolder =
    candidate.createsSubfolder && !candidate.isExistingLibrary;
  const confirmLabel = candidate.isExistingLibrary
    ? "Open this library"
    : newSubfolder
      ? "Create SandwichLibrary here"
      : "Use this folder";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-app-dim">
          Library folder
        </p>
        <p className="mt-1 break-all font-mono text-sm">{candidate.path}</p>
      </div>

      {candidate.isExistingLibrary && !candidate.schemaTooNew && (
        <Notice tone="info">
          An existing Sandwich library was found here. Sandwich will open it and
          keep everything in it.
        </Notice>
      )}
      {newSubfolder && (
        <Notice tone="info">
          The folder you picked already has other files, so Sandwich will keep
          the library in a new SandwichLibrary folder inside it.
        </Notice>
      )}
      {candidate.schemaTooNew && (
        <Notice tone="error">
          This library was made by a newer version of Sandwich. Update the app
          to open it, or choose a different folder.
        </Notice>
      )}
      {candidate.syncProvider && (
        <Notice tone="warning">
          This folder is inside {SYNC_PROVIDER_LABELS[candidate.syncProvider]}.
          Sync apps can corrupt the library database while Sandwich is using it.
          A folder that is not synced is safer. You can still use this one.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={PRIMARY}
          disabled={busy || candidate.schemaTooNew}
          onClick={() => void activate(false)}
        >
          {busy ? "Opening..." : confirmLabel}
        </button>
        <button
          type="button"
          className={SECONDARY}
          disabled={busy}
          onClick={() => {
            cancel();
            void choose("dialog");
          }}
        >
          Choose a different folder
        </button>
        <button
          type="button"
          className="text-sm text-app-muted underline-offset-2 hover:underline disabled:opacity-40"
          disabled={busy}
          onClick={cancel}
        >
          Cancel
        </button>
      </div>

      {newSubfolder && candidate.chosenPath && (
        <button
          type="button"
          className="self-start break-all text-left text-xs text-app-dim underline-offset-2 hover:underline disabled:opacity-40"
          disabled={busy}
          onClick={() => void activate(true)}
        >
          Use {candidate.chosenPath} directly instead
        </button>
      )}
    </div>
  );
};
