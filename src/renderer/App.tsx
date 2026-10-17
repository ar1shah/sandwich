import { useEffect } from "react";
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

  if (!state) {
    return <div className="h-screen bg-app" />;
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
