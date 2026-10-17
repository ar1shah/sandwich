import { useEffect, useState } from "react";
import { JobsTray } from "../jobs/JobsTray";
import { useNavStore } from "./navStore";
import { PAGES } from "./pages";

export const Sidebar: React.FC = () => {
  const page = useNavStore((state) => state.page);
  const setPage = useNavStore((state) => state.setPage);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.app.version().then((value) => {
      if (!cancelled) {
        setVersion(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-edge bg-panel">
      <div className="px-5 py-5 text-lg font-semibold tracking-tight">
        Sandwich
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {PAGES.map((item) => {
          const active = item.id === page;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPage(item.id)}
              aria-current={active ? "page" : undefined}
              className={
                "rounded-md px-3 py-2 text-left text-sm transition-colors " +
                (active
                  ? "bg-brand text-white"
                  : "text-app-muted hover:bg-white/5 hover:text-app-text")
              }
            >
              {item.label}
            </button>
          );
        })}
      </nav>
      <JobsTray />
      <div className="border-t border-edge px-5 py-3 text-xs text-app-dim">
        {version ? `v${version}` : "..."}
      </div>
    </aside>
  );
};
