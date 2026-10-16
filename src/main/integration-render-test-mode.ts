import { app } from "electron";
import path from "node:path";
import { SPIKE_MODES, type SpikeMode } from "../shared/spikeProps";
import { runSpike } from "./spike/spike";

// Scripted run of the spike, used to measure packaged builds without clicking:
//   Sandwich --integration-render-test <abs out .mp4> [--spike-mode sw|hw|sw-bitrate|hw-if-possible]
// Writes <name>.result.json next to the output, prints the result as JSON on stdout,
// exits 0 on success and 1 on failure.
export function getIntegrationRenderOutputPath(): string | null {
  const flagIndex = process.argv.indexOf("--integration-render-test");

  if (flagIndex === -1) {
    return null;
  }

  return process.argv[flagIndex + 1] ?? null;
}

export function getIntegrationSpikeMode(): SpikeMode {
  const flagIndex = process.argv.indexOf("--spike-mode");
  const value = flagIndex === -1 ? undefined : process.argv[flagIndex + 1];
  const mode = SPIKE_MODES.find((candidate) => candidate === value);
  if (value !== undefined && !mode) {
    throw new Error(`Unknown --spike-mode "${value}".`);
  }
  return mode ?? "sw";
}

export async function runIntegrationRenderTest(
  outputPath: string,
): Promise<void> {
  try {
    if (!path.isAbsolute(outputPath)) {
      throw new Error("Integration render output path must be absolute.");
    }

    const result = await runSpike({
      mode: getIntegrationSpikeMode(),
      outputPath,
      onProgress: (progress) => {
        const percent =
          progress.percent === null ? "" : ` ${Math.round(progress.percent)}%`;
        console.log(`[integration-render] ${progress.stage}${percent}`);
      },
    });

    console.log(JSON.stringify(result, null, 2));
    app.exit(result.ok ? 0 : 1);
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(`[integration-render] failed: ${message}`);
    app.exit(1);
  }
}
