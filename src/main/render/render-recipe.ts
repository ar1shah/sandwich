import {
  type DownloadBrowserProgressFn,
  type RenderMediaProgress,
  ensureBrowser,
  makeCancelSignal,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { SandwichProps } from "../../../remotion/types";
import { SANDWICH_COMPOSITION_ID } from "../../shared/composition";
import { isRenderable, RecipeSchema, type Recipe } from "../../shared/recipe";
import { msPerOutputSecond } from "../../shared/renderStats";
import { buildTimeline } from "../../shared/timeline";
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

// Where Remotion loads the composition from. Packaged builds use the bundle made at package
// time; dev builds bundle now. Callers that render several videos in one process (the CLI,
// the 4.4 render queue) call this once and pass the result to every renderRecipe call.
export async function prepareServeUrl({
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

export type RenderRecipeOptions = {
  outputPath: string;
  // http://127.0.0.1:<port>/m/<token>. Contains the token: never log it.
  mediaBaseUrl: string;
  isPackaged: boolean;
  projectRoot: string;
  // Skip bundling by passing the result of prepareServeUrl.
  serveUrl?: string;
  onProgress?: (update: RenderUpdate) => void;
  signal?: AbortSignal;
};

export const renderRecipe = async (
  recipeInput: Recipe,
  {
    outputPath,
    mediaBaseUrl,
    isPackaged,
    projectRoot,
    serveUrl: providedServeUrl,
    onProgress,
    signal,
  }: RenderRecipeOptions,
): Promise<RenderResult> => {
  const recipe = RecipeSchema.parse(recipeInput);
  if (!isRenderable(recipe)) {
    throw new Error("Cannot render: every slot needs a clip.");
  }
  const { fps } = recipe.output;
  const { totalFrames } = buildTimeline(recipe, fps);

  // One object for both calls, so calculateMetadata sees the real recipe in each.
  const inputProps: SandwichProps = { recipe, mediaBaseUrl };
  const inputPropsRecord: Record<string, unknown> = { ...inputProps };

  const { cancelSignal, cancel } = makeCancelSignal();
  let wasCancelled = false;
  cancelSignal(() => {
    wasCancelled = true;
  });
  const onAbort = (): void => cancel();
  if (signal?.aborted) {
    cancel();
  }
  signal?.addEventListener("abort", onAbort, { once: true });

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

  const totalStarted = performance.now();

  try {
    onProgress?.({
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
        const onDownloadProgress: DownloadBrowserProgressFn = (progress) => {
          onProgress?.({
            type: "progress",
            stage: "browser-download",
            progress: progress.percent,
          });
        };

        onProgress?.({
          type: "status",
          message: `Downloading ${browserName}...`,
        });

        return {
          version: null,
          onProgress: onDownloadProgress,
        };
      },
    });

    if (wasCancelled) {
      return await finishCancelledRender();
    }

    let serveUrl = providedServeUrl;
    let bundleMs: number | null = null;
    if (serveUrl === undefined) {
      const prepared = await prepareServeUrl({
        isPackaged,
        projectRoot,
        onUpdate: onProgress,
      });
      serveUrl = prepared.serveUrl;
      bundleMs = prepared.bundleMs;
    }

    if (wasCancelled) {
      return await finishCancelledRender();
    }

    const binariesDirectory = getBinariesDirectory({
      isPackaged,
      projectRoot,
    });

    const selectStarted = performance.now();
    const composition = await selectComposition({
      serveUrl,
      id: SANDWICH_COMPOSITION_ID,
      inputProps: inputPropsRecord,
      binariesDirectory,
      browserExecutable,
    });
    const selectMs = performance.now() - selectStarted;

    if (wasCancelled) {
      return await finishCancelledRender();
    }

    onProgress?.({
      type: "status",
      message: "Rendering video...",
    });

    let concurrency: number | null = null;
    const renderStarted = performance.now();
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      pixelFormat: "yuv420p",
      // Rec.709 matrix for the RGB -> YUV conversion (not just the tag); the default is bt601.
      colorSpace: "bt709",
      outputLocation: outputPath,
      inputProps: inputPropsRecord,
      binariesDirectory,
      browserExecutable,
      cancelSignal,
      audioCodec: "aac",
      sampleRate: 48000,
      // Keep the AAC stream even when every clip is muted or silent (output spec).
      enforceAudioTrack: true,
      overwrite: true,
      onStart: ({ resolvedConcurrency }) => {
        concurrency = resolvedConcurrency;
      },
      onProgress(progress: RenderMediaProgress) {
        onProgress?.({
          type: "progress",
          stage: "rendering",
          progress: progress.progress * 100,
        });
      },
    });
    const renderMs = performance.now() - renderStarted;

    if (wasCancelled) {
      return await finishCancelledRender();
    }

    return {
      cancelled: false,
      outputPath,
      outputSeconds: totalFrames / fps,
      timings: {
        bundleMs,
        selectMs,
        renderMs,
        totalMs: performance.now() - totalStarted,
        renderMsPerOutputSecond: msPerOutputSecond(renderMs, totalFrames, fps),
      },
      concurrency,
    };
  } catch (error) {
    if (wasCancelled || isRenderCancelledError(error)) {
      return await finishCancelledRender();
    }

    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
};
