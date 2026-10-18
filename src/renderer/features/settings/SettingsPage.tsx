import { SYNC_PROVIDER_LABELS } from "../../../shared/syncedFolders";
import { LibraryPicker } from "../library/LibraryPicker";
import { useLibraryStore } from "../library/libraryStore";
import { EditorSettingsSection } from "./EditorSettingsSection";
import { TroubleshootingSection } from "./TroubleshootingSection";

const SECONDARY_BUTTON =
  "rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:bg-white/5";

export const SettingsPage: React.FC = () => {
  const state = useLibraryStore((s) => s.state);
  const candidate = useLibraryStore((s) => s.candidate);
  const choose = useLibraryStore((s) => s.choose);

  if (state?.status !== "ready") {
    return null;
  }
  // The review panel shows while main holds a candidate; it closes when the switch lands
  // or the user cancels. A cancelled folder dialog changes nothing.
  const showPicker = candidate !== null;

  return (
    <>
      <EditorSettingsSection />
      <section className="mt-6 max-w-2xl rounded-xl border border-edge bg-panel p-6">
        <h2 className="text-lg font-medium">Library</h2>
        <p className="mt-1 text-sm text-app-muted">
          Everything Sandwich stores lives in this folder.
        </p>
        <p className="mt-4 break-all font-mono text-sm">{state.path}</p>
        {state.syncProvider && (
          <p
            role="note"
            className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          >
            This library is inside {SYNC_PROVIDER_LABELS[state.syncProvider]}.
            Sync apps can corrupt the database while Sandwich is using it.
          </p>
        )}
        <div className="mt-5">
          {showPicker ? (
            <LibraryPicker />
          ) : (
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => void choose("dialog")}
            >
              Switch library
            </button>
          )}
        </div>
      </section>
      <TroubleshootingSection />
    </>
  );
};
