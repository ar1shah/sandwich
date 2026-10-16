import {
  type CancelSignal,
  type DownloadBrowserProgressFn,
  type RenderMediaProgress,
  ensureBrowser,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";
import { rm } from "node:fs/promises";
import path from "node:path";
import {
  RENDER_CANCELLED_MESSAGE,
  type RenderResult,
  type RenderUpdate,
} from "./types";
import { getCompositorPackage } from "./compositor-package";
import {
  bundleRemotionProject,
  getPrebuiltRemotionBundlePath,
  hasPrebuiltRemotionBundle,
} from "./remotion-bundle";
import { getPackagedBrowserPaths } from "./packaged-browser";

export type RenderHardwareAcceleration = "disable" | "if-possible" | "required";

function isRenderCancelledError(error: unknown): boolean {
  return error instanceof Error && error.message === RENDER_CANCELLED_MESSAGE;
}

function getBinariesDirectory({
  isPackaged,
  projectRoot,
}: {
  isPackaged: boolean;
  projectRoot: string;
}): string | null {
  if (!isPackaged) {
    return null;
  }

  const compositorPackage = getCompositorPackage({
    arch: process.arch,
    platform: process.platform,
  });

  return path.join(
    path.dirname(projectRoot),
    "app.asar.unpacked",
    "node_modules",
    compositorPackage,
  );
}

async function getServeUrl({
  isPackaged,
  projectRoot,
  onUpdate,
}: {
  isPackaged: boolean;
  projectRoot: string;
  onUpdate?: (update: RenderUpdate) => void;
}): Promise<{ serveUrl: string; bundleMs: number | null }> {
  if (isPackaged) {
    if (!hasPrebuiltRemotionBundle(projectRoot)) {
      throw new Error(
        "The packaged app is missing its prebuilt Remotion bundle. Rebuild the Electron app.",
      );
    }

    onUpdate?.({
      type: "status",
      message: "Using the prebuilt Remotion bundle from the packaged app...",
    });

    return {
      serveUrl: getPrebuiltRemotionBundlePath(projectRoot),
      bundleMs: null,
    };
  }

  onUpdate?.({
    type: "status",
    message: "Bundling the Remotion project for development...",
  });

  const started = performance.now();
  const serveUrl = await bundleRemotionProject({
    projectRoot,
    onUpdate,
  });
  return { serveUrl, bundleMs: performance.now() - started };
}

// Remotion prints the encoder it picked through console.log at "verbose" log level.
// Tap the console for the duration of a render so the choice can be recorded.
const ENCODER_PATTERN =
  /\b(h264_videotoolbox|hevc_videotoolbox|prores_videotoolbox|h264_nvenc|libx264|libx265|prores_ks)\b/;
const TAPPED_METHODS = ["log", "info", "warn", "error", "debug"] as const;

function tapConsole(): { stop: () => string[] } {
  const lines: string[] = [];
  const originals = TAPPED_METHODS.map((method) => console[method]);

  TAPPED_METHODS.forEach((method, index) => {
    const original = originals[index];
    console[method] = (...args: unknown[]) => {
      const text = args
        .map((arg) => (typeof arg === "string" ? arg : String(arg)))
        .join(" ");
      if (ENCODER_PATTERN.test(text)) {
        lines.push(text.slice(0, 400));
      }
      original?.apply(console, args);
    };
  });

  return {
    stop: () => {
      TAPPED_METHODS.forEach((method, index) => {
        const original = originals[index];
        if (original) {
          console[method] = original;
        }
      });
      return lines;
    },
  };
}

export const renderVideo = async ({
  isPackaged,
  outputPath,
  projectRoot,
  compositionId,
  inputProps,
  hardwareAcceleration = "disable",
  videoBitrate = null,
  logLevel = "info",
  onUpdate,
  cancelSignal,
}: {
  isPackaged: boolean;
  outputPath: string;
  projectRoot: string;
  compositionId: string;
  inputProps: Record<string, unknown>;
  hardwareAcceleration?: RenderHardwareAcceleration;
  // e.g. "8M". Hardware encoders cannot use CRF, so they need a bitrate.
  videoBitrate?: string | null;
  logLevel?: "verbose" | "info" | "warn" | "error";
  onUpdate?: (update: RenderUpdate) => void;
  cancelSignal?: CancelSignal;
}): Promise<RenderResult> => {
  let wasCancelled = false;
  const browserExecutable = isPackaged
    ? (getPackagedBrowserPaths({
        arch: process.arch,
        platform: process.platform,
        projectRoot,
      })?.packagedBrowserExecutablePath ?? null)
    : null;

  async function finishCancelledRender(): Promise<RenderResult> {
    await rm(outputPath, { force: true });
    return {
      cancelled: true as const,
      outputPath: null,
    };
  }

  cancelSignal?.(() => {
    wasCancelled = true;
  });

  const totalStarted = performance.now();
  const tap = logLevel === "verbose" ? tapConsole() : null;
  let encoderLines: string[] = [];

  try {
    onUpdate?.({
      type: "status",
      message: "Checking browser installation...",
    });

    await ensureBrowser({
      browserExecutable,
      onBrowserDownload: ({ chromeMode }) => {
        const browserName =
          chromeMode === "chrome-for-testing"
            ? "Chrome"
            : "Chrome Headless Shell";
        const onProgress: DownloadBrowserProgressFn = (progress) => {
          onUpdate?.({
            type: "progress",
            stage: "browser-download",
            progress: progress.percent,
          });
        };

        onUpdate?.({
          type: "status",
          message: `Downloading ${browserName}...`,
        });

        return {
          version: null,
          onProgress,
        };
      },
    });

    if (wasCancelled) {
      return finishCancelledRender();
    }

    const { serveUrl, bundleMs } = await getServeUrl({
      isPackaged,
      projectRoot,
      onUpdate,
    });

    if (wasCancelled) {
      return finishCancelledRender();
    }

    const binariesDirectory = getBinariesDirectory({
      isPackaged,
      projectRoot,
    });

    const selectStarted = performance.now();
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps,
      binariesDirectory,
      browserExecutable,
      logLevel,
    });
    const selectMs = performance.now() - selectStarted;

    if (wasCancelled) {
      return finishCancelledRender();
    }

    onUpdate?.({
      type: "status",
      message: "Rendering video...",
    });

    let concurrency: number | null = null;
    const renderStarted = performance.now();
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      binariesDirectory,
      browserExecutable,
      cancelSignal,
      logLevel,
      hardwareAcceleration,
      ...(videoBitrate ? { videoBitrate } : {}),
      audioCodec: "aac",
      sampleRate: 48000,
      overwrite: true,
      onStart: ({ resolvedConcurrency }) => {
        concurrency = resolvedConcurrency;
      },
      onProgress(progress: RenderMediaProgress) {
        onUpdate?.({
          type: "progress",
          stage: "rendering",
          progress: progress.progress * 100,
        });
      },
    });
    const renderMs = performance.now() - renderStarted;

    encoderLines = tap?.stop() ?? [];

    if (wasCancelled) {
      return finishCancelledRender();
    }

    const encoder = encoderLines
      .map((line) => ENCODER_PATTERN.exec(line)?.[1] ?? null)
      .find((name) => name !== null);

    return {
      cancelled: false,
      outputPath,
      timings: {
        bundleMs,
        selectMs,
        renderMs,
        totalMs: performance.now() - totalStarted,
      },
      concurrency,
      encoder: encoder ?? null,
      encoderLogLines: encoderLines.slice(0, 8),
    };
  } catch (error) {
    if (wasCancelled || isRenderCancelledError(error)) {
      return finishCancelledRender();
    }

    throw error;
  } finally {
    tap?.stop();
  }
};
