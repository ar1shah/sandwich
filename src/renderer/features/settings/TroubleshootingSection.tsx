import { useEffect, useState } from "react";

// Where to look when something breaks: the app version and the log folder.
export const TroubleshootingSection: React.FC = () => {
  const [version, setVersion] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    window.api.app
      .version()
      .then(setVersion)
      .catch(() => undefined);
  }, []);

  async function openLogs() {
    setProblem(null);
    try {
      const result = await window.api.app.openLogsFolder();
      if (!result.ok) {
        setProblem(result.message);
      }
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section
      aria-label="Troubleshooting"
      className="mt-6 max-w-2xl rounded-xl border border-edge bg-panel p-6"
    >
      <h2 className="text-lg font-medium">Troubleshooting</h2>
      <p className="mt-1 text-sm text-app-muted">
        If something breaks, send the log files in this folder along with a
        short description of what you were doing.
        {version ? ` Sandwich version ${version}.` : ""}
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={() => void openLogs()}
          className="rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:bg-white/5"
        >
          Open logs folder
        </button>
      </div>
      {problem && (
        <p role="alert" className="mt-3 break-words text-sm text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
};
