import { PageView } from "./features/shell/PageView";
import { Sidebar } from "./features/shell/Sidebar";

export const App: React.FC = () => {
  return (
    <div className="flex h-screen bg-app text-app-text">
      <Sidebar />
      <PageView />
    </div>
  );
};
