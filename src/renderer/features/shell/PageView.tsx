import { useNavStore } from "./navStore";
import { PAGES } from "./pages";

export const PageView: React.FC = () => {
  const page = useNavStore((state) => state.page);
  const label = PAGES.find((item) => item.id === page)?.label ?? page;

  return (
    <main className="flex flex-1 flex-col overflow-auto p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
    </main>
  );
};
