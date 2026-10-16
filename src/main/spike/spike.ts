// Step 0.4 spike runner: serves the staged fixtures over HTTP, renders the Spike
// composition with Remotion, and records what happened in a sibling .result.json.
// Removed together with the spike (see CHECKLIST 1.4).
import { app } from "electron";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildSpikeProps,
  SPIKE_COMPOSITION_ID,
  SPIKE_MODE_CONFIG,
  spikeOutputFileName,
  type SpikeMode,
  type SpikeProgress,
  type SpikeResult,
} from "../../shared/spikeProps";
import { renderVideo } from "../render/render-video";
import { startSpikeMediaServer } from "./mediaServer";

declare const __REMOTION_VERSION__: string;

const X264_SEI_MARKER = "x264 - core";

// Packaged: <Resources>/app.asar.unpacked/spike-media (staged by forge.config.ts).
// Dev: the generated fixtures folder.
export function getSpikeMediaDir(): string {
  if (app.isPackaged) {
    return path.join(
      path.dirname(app.getAppPath()),
      "app.asar.unpacked",
      "spike-media",
    );
  }
  return path.join(app.getAppPath(), "fixtures");
}

export function getDefaultSpikeOutputPath(mode: SpikeMode): string {
  return path.join(app.getPath("videos"), spikeOutputFileName(mode));
}

export function getResultPath(outputPath: string): string {
  const { dir, name } = path.parse(outputPath);
  return path.join(dir, `${name}.result.json`);
}

function describeError(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

export async function runSpike({
  mode,
  outputPath = getDefaultSpikeOutputPath(mode),
  onProgress,
}: {
  mode: SpikeMode;
  outputPath?: string;
  onProgress?: (progress: SpikeProgress) => void;
}): Promise<SpikeResult> {
  const config = SPIKE_MODE_CONFIG[mode];
  const resultPath = getResultPath(outputPath);
  const base: SpikeResult = {
    mode,
    ok: false,
    outputPath,
    resultPath,
    timings: null,
    arch: process.arch,
    cpuCount: os.cpus().length,
    concurrency: null,
    hardwareAcceleration: config.hardwareAcceleration,
    videoBitrate: config.videoBitrate,
    encoder: null,
    x264Sei: null,
    bytes: null,
    remotionVersion: __REMOTION_VERSION__,
    electronVersion: process.versions.electron ?? "unknown",
    packaged: app.isPackaged,
    error: null,
  };

  const emit = (
    stage: SpikeProgress["stage"],
    message: string,
    percent: number | null,
  ): void => onProgress?.({ mode, stage, message, percent });

  let result: SpikeResult = base;
  const server = await startSpikeMediaServer(getSpikeMediaDir());
  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    emit("status", `Media server on ${server.origin}`, null);

    const rendered = await renderVideo({
      isPackaged: app.isPackaged,
      outputPath,
      projectRoot: app.getAppPath(),
      compositionId: SPIKE_COMPOSITION_ID,
      inputProps: buildSpikeProps(server.origin),
      hardwareAcceleration: config.hardwareAcceleration,
      videoBitrate: config.videoBitrate,
      logLevel: "verbose",
      onUpdate: (update) => {
        if (update.type === "status") {
          emit("status", update.message, null);
        } else {
          emit(update.stage, update.stage, update.progress);
        }
      },
    });

    if (rendered.cancelled) {
      throw new Error("Render was cancelled.");
    }

    const info = await stat(outputPath);
    const file = await readFile(outputPath);
    result = {
      ...base,
      ok: true,
      timings: rendered.timings,
      concurrency: rendered.concurrency,
      encoder: rendered.encoder,
      x264Sei: file.includes(X264_SEI_MARKER),
      bytes: info.size,
    };
  } catch (error) {
    result = { ...base, error: describeError(error) };
  } finally {
    await server.close();
  }

  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
