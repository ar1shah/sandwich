import { LoadError } from "./components/LoadError";
import { useEffect } from "react";
import { startEditor } from "./features/editor/editorStore";
import { useNavStore } from "./features/shell/navStore";
import { useLibraryStore } from "./features/library/libraryStore";
import { WelcomeScreen } from "./features/library/WelcomeScreen";
import { PageView } from "./features/shell/PageView";
import { Sidebar } from "./features/shell/Sidebar";

export const App: React.FC = () => {
  const state = useLibraryStore((s) => s.state);
  const load = useLibraryStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = state?.status === "ready";
  useEffect(() => {
    if (!ready) {
      return;
    }
    // Finished imports land in their slots; the draft that was open comes back, and the
    // app opens on it.
    return startEditor(() => useNavStore.getState().setPage("new-video"));
  }, [ready]);

  const error = useLibraryStore((s) => s.error);
  if (!state) {
    return (
      <div className="h-screen bg-app p-8 text-app-text">
        {error && (
          <LoadError
            className="max-w-xl"
            message={`Sandwich could not start: ${error}`}
            onRetry={() => void load()}
          />
        )}
      </div>
    );
  }
  if (state.status !== "ready") {
    return <WelcomeScreen state={state} />;
  }
  return (
    <div className="flex h-screen bg-app text-app-text">
      <Sidebar />
      <PageView />
    </div>
  );
};
