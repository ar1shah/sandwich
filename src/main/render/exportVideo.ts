import {
  copyFile,
  constants as fsConstants,
  link,
  mkdir,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { withProductSlug } from "../../shared/drafts";
import { jobTmpDir } from "../../shared/importPaths";
import type { ExportJobResult } from "../../shared/jobs";
import type { JobRunContext } from "../../shared/jobScheduler";
import { buildExportName, type ExportName } from "../../shared/naming";
import { isRenderable, RecipeSchema, type Recipe } from "../../shared/recipe";
import { toAbsolute } from "../db/libraryPaths";
import type { Repos } from "../db/repos";
import { AbortError } from "../media/run";
import type { RenderResult, RenderUpdate } from "./types";
import { describeRows, type VerifyOptions, type VerifyResult } from "./verify";

// How often the final move re-picks a name after losing a race for it. The render pool is 1,
// so this only happens when something else writes into the folder at the same moment.
const MAX_NAME_ATTEMPTS = 5;

// Share of the job bar the render takes; the checks fill the rest.
const RENDER_SHARE = 90;

export type ExportDeps = {
  root: string;
  repos: Repos;
  // renderRecipe in the app. `outputPath` is always inside cache/tmp/<jobId>/.
  render: (
    recipe: Recipe,
    options: {
      outputPath: string;
      signal: AbortSignal;
      onProgress: (update: RenderUpdate) => void;
    },
  ) => Promise<RenderResult>;
  // verifyRender in the app.
  verify: (
    options: Pick<
      VerifyOptions,
      "file" | "recipe" | "mediaRoot" | "signal" | "catchSoftErrors"
    >,
  ) => Promise<VerifyResult>;
  now: () => Date;
};

type JobContext = Pick<JobRunContext, "jobId" | "signal" | "setProgress">;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

// An export the user can fix (the product is gone, or the video is already exporting), as
// opposed to a bug.
export class ExportRejectedError extends Error {
  constructor(
    readonly code: "not-found" | "already-exporting",
    message: string,
  ) {
    super(message);
    this.name = "ExportRejectedError";
  }
}

export class NameTakenError extends Error {}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// Puts a copy of `from` at `to` without ever replacing an existing file (fs.rename would, on
// macOS). A hard link is atomic and shares the data; filesystems without links (exFAT, other
// volumes) fall back to an exclusive copy. `from` stays where it is: the tmp dir is removed
// as a whole afterwards.
export async function claim(from: string, to: string): Promise<void> {
  try {
    await link(from, to);
    return;
  } catch (error) {
    const code = errorCode(error);
    if (code === "EEXIST") {
      throw new NameTakenError(to);
    }
    if (code !== "EXDEV" && code !== "EPERM" && code !== "ENOTSUP") {
      throw error;
    }
  }
  try {
    await copyFile(from, to, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      throw new NameTakenError(to);
    }
    throw error;
  }
}

// Picks the name from what is in the folder RIGHT NOW and claims it. Nothing is awaited
// between reading the folder and the first claim except the read itself.
async function moveIntoExports({
  root,
  slug,
  beforeCaption,
  now,
  tmpVideo,
  tmpSidecar,
}: {
  root: string;
  slug: string;
  beforeCaption: string;
  now: () => Date;
  tmpVideo: string;
  tmpSidecar: string;
}): Promise<{ name: ExportName; folder: string }> {
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
    const date = now();
    // The folder segments do not depend on the existing names, so build once with no
    // names to find the folder, then re-read it.
    const probe = buildExportName({
      productSlug: slug,
      beforeCaption,
      date,
      existingNames: [],
    });
    const folder = toAbsolute(root, probe.folderSegments.join("/"));
    await mkdir(folder, { recursive: true });
    const existingNames = await readdir(folder).catch(() => [] as string[]);
    const name = buildExportName({
      productSlug: slug,
      beforeCaption,
      date,
      existingNames,
    });
    const videoTarget = path.join(folder, name.fileName);
    const sidecarTarget = path.join(folder, name.sidecarName);
    try {
      await claim(tmpVideo, videoTarget);
    } catch (error) {
      if (error instanceof NameTakenError) {
        continue;
      }
      throw error;
    }
    try {
      await claim(tmpSidecar, sidecarTarget);
    } catch (error) {
      // Never leave an mp4 without its sidecar.
      await rm(videoTarget, { force: true });
      if (error instanceof NameTakenError) {
        continue;
      }
      throw error;
    }
    return { name, folder };
  }
  throw new Error("Could not find a free export name. Try again.");
}

function markFailed(repos: Repos, videoId: string): void {
  try {
    repos.videos.update(videoId, { status: "failed" });
  } catch {
    // The row or library may be gone; the original error is the one to report.
  }
}

// Export one draft: render -> verify -> sidecar -> move into exports/ -> mark exported.
//
// Like importClip, everything is produced inside cache/tmp/<jobId>/ and only moved into
// exports/ as the last step. A crash or cancel therefore leaves nothing in exports/ (cache/tmp
// is swept on the next open) and never burns a name (DECISIONS #37).
export async function exportVideo(
  recipeInput: Recipe,
  context: JobContext,
  deps: ExportDeps,
): Promise<ExportJobResult> {
  const { jobId, signal, setProgress } = context;
  const { root, repos } = deps;

  const parsed = RecipeSchema.parse(recipeInput);
  const product = repos.products.get(parsed.productId);
  if (!product) {
    throw new Error("That product no longer exists.");
  }
  if (!repos.videos.get(parsed.id)) {
    throw new Error("That draft no longer exists.");
  }
  // Name from the CURRENT slug, not the one stored when the draft was made.
  const recipe = withProductSlug(parsed, product.slug);
  if (!isRenderable(recipe)) {
    throw new Error("Every slot needs a clip before exporting.");
  }

  const tmpDir = toAbsolute(root, jobTmpDir(jobId));
  const tmpVideo = path.join(tmpDir, "out.mp4");
  const tmpSidecar = path.join(tmpDir, "out.recipe.json");

  try {
    await mkdir(tmpDir, { recursive: true });
    setProgress(0, "Preparing");

    const rendered = await deps.render(recipe, {
      outputPath: tmpVideo,
      signal,
      onProgress: (update) => {
        if (update.type !== "progress") {
          return;
        }
        if (update.stage === "rendering") {
          setProgress((update.progress / 100) * RENDER_SHARE, "Rendering");
        } else {
          // browser-download and bundling only name the stage: their numbers would pin the
          // bar, because progress never goes down.
          setProgress(
            0,
            update.stage === "bundling"
              ? "Preparing the renderer"
              : "Downloading the renderer",
          );
        }
      },
    });
    if (rendered.cancelled) {
      throw new AbortError("Export cancelled.");
    }
    signal.throwIfAborted();

    setProgress(RENDER_SHARE, "Checking");
    const verdict = await deps.verify({
      file: tmpVideo,
      recipe,
      mediaRoot: root,
      signal,
      catchSoftErrors: true,
    });
    if (!verdict.ok) {
      throw new Error(
        `The exported file failed its checks: ${describeRows(verdict.hardFailures).join("; ")}`,
      );
    }
    await writeFile(tmpSidecar, `${JSON.stringify(recipe, null, 2)}\n`, "utf8");
    // Last chance to cancel: past this point the export is finished, not cancelled.
    signal.throwIfAborted();

    setProgress(97, "Saving");
    const { name, folder } = await moveIntoExports({
      root,
      slug: product.slug,
      beforeCaption: recipe.clips[0].caption?.text ?? "",
      now: deps.now,
      tmpVideo,
      tmpSidecar,
    });
    const exportPath = [...name.folderSegments, name.fileName].join("/");

    // The exported row and the caption use counts commit together (DECISIONS #38).
    try {
      repos.transaction(() => {
        repos.videos.update(recipe.id, {
          status: "exported",
          exportPath,
          recipeJson: JSON.stringify(recipe),
        });
        const captionIds = new Set<string>();
        for (const clip of recipe.clips) {
          if (clip.caption?.sourceCaptionId) {
            captionIds.add(clip.caption.sourceCaptionId);
          }
        }
        for (const captionId of captionIds) {
          // A caption deleted from the bank since it was picked is simply not counted.
          if (repos.captions.get(captionId)) {
            repos.captions.incrementUseCount(captionId);
          }
        }
      });
    } catch (error) {
      // No row says "exported", so no file may sit in exports/ claiming to be one.
      await rm(path.join(folder, name.fileName), { force: true });
      await rm(path.join(folder, name.sidecarName), { force: true });
      throw error;
    }

    return {
      videoId: recipe.id,
      exportPath,
      warnings: describeRows(verdict.warnings),
    };
  } catch (error) {
    if (!signal.aborted && !isAbort(error)) {
      markFailed(repos, recipe.id);
    }
    throw error;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
