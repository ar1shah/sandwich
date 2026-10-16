// Step 0.4 spike UI: temporary. Removed with the spike (see CHECKLIST 1.4).
import { useEffect, useState } from "react";
import {
  SPIKE_MODES,
  type SpikeMode,
  type SpikeProgress,
  type SpikeResult,
} from "../../../shared/spikeProps";

const MODE_LABELS: Record<SpikeMode, string> = {
  sw: "Software (default quality)",
  hw: "Hardware, required (8M)",
  "sw-bitrate": "Software, same bitrate (8M)",
  "hw-if-possible": "Hardware, if possible (8M)",
};

function seconds(ms: number | null | undefined): string {
  return ms === null || ms === undefined
    ? "n/a"
    : `${(ms / 1000).toFixed(1)} s`;
}

const ResultCard: React.FC<{ result: SpikeResult }> = ({ result }) => (
  <div className="rounded-md border border-edge bg-panel p-3 text-sm">
    <div className="font-medium">
      {result.mode}: {result.ok ? "done" : "failed"}
    </div>
    {result.ok ? (
      <dl className="mt-2 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-app-muted">
        <dt>Render</dt>
        <dd>{seconds(result.timings?.renderMs)}</dd>
        <dt>Total</dt>
        <dd>{seconds(result.timings?.totalMs)}</dd>
        <dt>Bundling</dt>
        <dd>{seconds(result.timings?.bundleMs)}</dd>
        <dt>Encoder</dt>
        <dd>{result.encoder ?? "not reported"}</dd>
        <dt>x264 SEI in file</dt>
        <dd>{String(result.x264Sei)}</dd>
        <dt>Size</dt>
        <dd>
          {result.bytes === null
            ? "n/a"
            : `${(result.bytes / (1024 * 1024)).toFixed(1)} MB`}
        </dd>
        <dt>Machine</dt>
        <dd>
          {result.arch}, {result.cpuCount} cores, concurrency{" "}
          {result.concurrency ?? "n/a"}
        </dd>
        <dt>File</dt>
        <dd className="break-all">{result.outputPath}</dd>
      </dl>
    ) : (
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-red-300">
        {result.error}
      </pre>
    )}
  </div>
);

export const SpikeSection: React.FC = () => {
  const [mode, setMode] = useState<SpikeMode>("sw");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SpikeProgress | null>(null);
  const [results, setResults] = useState<SpikeResult[]>([]);

  useEffect(() => window.api.spike.onProgress(setProgress), []);

  // Runs the modes in order. In "Run all", the if-possible pass only happens for the
  // record when the "required" hardware pass failed.
  const run = async (modes: SpikeMode[], isRunAll: boolean): Promise<void> => {
    setRunning(true);
    setResults([]);
    try {
      for (const next of modes) {
        const result = await window.api.spike.render({ mode: next });
        setResults((previous) => [...previous, result]);
        if (isRunAll && next === "hw" && !result.ok) {
          const fallback = await window.api.spike.render({
            mode: "hw-if-possible",
          });
          setResults((previous) => [...previous, fallback]);
        }
      }
    } catch (error) {
      setResults((previous) => [
        ...previous,
        {
          mode,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } as SpikeResult,
      ]);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const percent = progress?.percent ?? null;

  return (
    <section className="mt-8 max-w-2xl rounded-lg border border-edge p-4">
      <h2 className="text-lg font-medium">Render spike (temporary)</h2>
      <p className="mt-1 text-sm text-app-muted">
        Renders a 12 second test video with Remotion in the main process. Output
        goes to your Movies folder as sandwich-spike-&lt;mode&gt;.mp4 with a
        .result.json next to it.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border border-edge bg-panel px-3 py-2 text-sm"
          value={mode}
          disabled={running}
          onChange={(event) => setMode(event.target.value as SpikeMode)}
        >
          {SPIKE_MODES.map((value) => (
            <option key={value} value={value}>
              {MODE_LABELS[value]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={running}
          onClick={() => void run([mode], false)}
        >
          Render spike
        </button>
        <button
          type="button"
          className="rounded-md border border-edge px-4 py-2 text-sm disabled:opacity-50"
          disabled={running}
          onClick={() => void run(["sw", "hw", "sw-bitrate"], true)}
        >
          Run all modes
        </button>
      </div>

      {running && (
        <div className="mt-4">
          <div className="text-sm text-app-muted">
            {progress?.message ?? "Starting..."}
            {percent === null ? "" : ` ${Math.round(percent)}%`}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-edge">
            <div
              className="h-full bg-brand"
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {results.map((result) => (
          <ResultCard key={result.mode} result={result} />
        ))}
      </div>
    </section>
  );
};
