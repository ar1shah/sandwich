import { access } from "node:fs/promises";
import path from "node:path";
import type { Video, VideoStatus } from "../../shared/library";
import { checkRelativeLibraryPath } from "../../shared/libraryPaths";
import { isRenderable, type Recipe } from "../../shared/recipe";
import {
  ALREADY_EXPORTING_MESSAGE,
  EXPORTING_MESSAGE,
  NOT_A_DRAFT_MESSAGE,
  NOT_RENDERABLE_MESSAGE,
  PRODUCT_GONE_MESSAGE,
  type ExportFileState,
  type ExportStarted,
  type RemovedVideo,
  type SavedDraft,
  type VideoError,
  type VideoResult,
} from "../../shared/videos";
import { toAbsolute } from "../db/libraryPaths";
import { resolveInsideReal } from "../media/pathGuard";
import type { Repos } from "../db/repos";
import { ExportRejectedError } from "../render/exportVideo";

export type VideoServiceDeps = {
  // The active library, read per call (null = none open).
  getLibrary: () => { repos: Repos } | null;
  // The render queue. Without it exporting is unavailable and nothing counts as exporting.
  exports?: {
    // Queues a render job for a saved draft; returns the job id.
    start: (recipe: Recipe) => string;
    // The queued or running export job of this video, or null.
    activeJobId: (videoId: string) => string | null;
  };
  // The active library root, only needed by reveal.
  getRoot?: () => string | null;
  // Shows a file in Finder / Explorer. A wrapper at the call site, not shell.showItemInFolder
  // itself, so a test can replace shell.showItemInFolder at runtime.
  reveal?: (absolutePath: string) => void;
  // Moves a file to the OS Trash (shell.trashItem). A wrapper at the call site for the same
  // reason as `reveal`. Must reject when the file cannot be trashed.
  trash?: (absolutePath: string) => Promise<void>;
};

const EXPORTS_DIR = "exports";

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The sidecar sits next to the mp4 with the same base name (naming.ts).
function sidecarPathOf(exportPath: string): string {
  return exportPath.replace(/\.mp4$/i, "") + ".recipe.json";
}

function fail(code: VideoError["code"], message: string): VideoError {
  return { ok: false, code, message };
}

// Drafts: autosave target, listing, deletion. No Electron imports.
export function createVideoService(deps: VideoServiceDeps) {
  function requireRepos(): Repos {
    const library = deps.getLibrary();
    if (!library) {
      throw new Error("Open a library before using videos.");
    }
    return library.repos;
  }

  // Moves the mp4 and its sidecar to the Trash; see remove().
  async function trashExportFiles(
    exportPath: string,
  ): Promise<VideoResult<RemovedVideo>> {
    const root = deps.getRoot?.() ?? null;
    if (!root || !deps.trash) {
      return fail("delete-failed", "Deleting files is not available.");
    }
    const exportsPrefix = `${EXPORTS_DIR}/`;
    if (!exportPath.startsWith(exportsPrefix)) {
      return fail(
        "delete-failed",
        "That file is not inside the exports folder, so it was left alone.",
      );
    }
    const exportsRoot = path.join(root, EXPORTS_DIR);

    // realpath containment: a symlink or `..` cannot lead out of exports/.
    async function trashOne(
      relative: string,
    ): Promise<"trashed" | "missing" | "outside"> {
      const resolved = await resolveInsideReal(
        exportsRoot,
        relative.slice(exportsPrefix.length).split("/"),
      );
      if (resolved.kind === "outside") {
        return "outside";
      }
      if (resolved.kind !== "ok") {
        return "missing";
      }
      try {
        await deps.trash?.(resolved.path);
      } catch (error) {
        if (errorCode(error) === "ENOENT") {
          return "missing";
        }
        throw error;
      }
      return "trashed";
    }

    try {
      if ((await trashOne(exportPath)) === "outside") {
        return fail(
          "delete-failed",
          "That file is not inside the exports folder, so it was left alone.",
        );
      }
    } catch (error) {
      return fail(
        "delete-failed",
        `The video file could not be moved to the Trash: ${messageOf(error)}`,
      );
    }

    try {
      if ((await trashOne(sidecarPathOf(exportPath))) === "outside") {
        return {
          ok: true,
          value: {
            warning:
              "The video was moved to the Trash. Its recipe file was left alone because it is outside the exports folder.",
          },
        };
      }
    } catch (error) {
      return {
        ok: true,
        value: {
          warning: `The video was moved to the Trash, but its recipe file could not be: ${messageOf(error)}`,
        },
      };
    }
    return { ok: true, value: { warning: null } };
  }

  const service = {
    // `recipe` is already schema-valid (the IPC handler parses it). Media paths are
    // checked again here because they end up in a file path later.
    saveDraft(recipe: Recipe): VideoResult<SavedDraft> {
      const repos = requireRepos();
      // The render reads the saved recipe's media, and a finished export replaces the row, so
      // nothing may change the row mid-export.
      if (deps.exports?.activeJobId(recipe.id)) {
        return fail("exporting", EXPORTING_MESSAGE);
      }
      for (const clip of recipe.clips) {
        if (clip.mediaPath === "") {
          continue;
        }
        const check = checkRelativeLibraryPath(clip.mediaPath);
        if (!check.ok) {
          return fail("invalid", `The ${clip.slot} clip path ${check.reason}.`);
        }
      }

      const existing = repos.videos.get(recipe.id);
      if (existing) {
        // A failed export is saved like a draft and becomes one again (DECISIONS #38).
        if (existing.status === "exported") {
          return fail("not-draft", NOT_A_DRAFT_MESSAGE);
        }
        if (existing.productId !== recipe.productId) {
          return fail("invalid", "A draft cannot change its product.");
        }
        // Updating works even when the product was archived since: the user's clips
        // must not be lost to a later housekeeping step.
      } else {
        // Only a NEW draft needs a live product.
        const product = repos.products.get(recipe.productId);
        if (!product || product.archivedAt !== null) {
          return fail("product-missing", PRODUCT_GONE_MESSAGE);
        }
      }

      const saved = repos.videos.upsertDraft({
        id: recipe.id,
        productId: recipe.productId,
        recipeJson: JSON.stringify(recipe),
      });
      if (!saved) {
        return fail("not-draft", NOT_A_DRAFT_MESSAGE);
      }
      return { ok: true, value: { id: saved.id, updatedAt: saved.updatedAt } };
    },

    list(options: { status?: VideoStatus } = {}): Video[] {
      return requireRepos().videos.list(options);
    },

    get(id: string): Video | null {
      return requireRepos().videos.get(id);
    },

    // Saves the draft (so the render and the row agree), then queues the render job.
    export(recipe: Recipe): VideoResult<ExportStarted> {
      if (!deps.exports) {
        throw new Error("Exporting is not set up.");
      }
      if (!isRenderable(recipe)) {
        return fail("not-renderable", NOT_RENDERABLE_MESSAGE);
      }
      if (deps.exports.activeJobId(recipe.id)) {
        return fail("already-exporting", ALREADY_EXPORTING_MESSAGE);
      }
      const saved = service.saveDraft(recipe);
      if (!saved.ok) {
        return saved;
      }
      try {
        return { ok: true, value: { jobId: deps.exports.start(recipe) } };
      } catch (error) {
        if (error instanceof ExportRejectedError) {
          return fail(
            error.code === "not-found" ? "product-missing" : error.code,
            error.code === "not-found"
              ? PRODUCT_GONE_MESSAGE
              : ALREADY_EXPORTING_MESSAGE,
          );
        }
        throw error;
      }
    },

    // Shows the exported file in the file manager. The path comes from the row, never from
    // the renderer.
    async reveal(id: string): Promise<VideoResult<true>> {
      const repos = requireRepos();
      const root = deps.getRoot?.() ?? null;
      const video = repos.videos.get(id);
      if (!root || !deps.reveal || !video || video.exportPath === null) {
        return fail("not-found", "That video has not been exported.");
      }
      const file = toAbsolute(root, video.exportPath);
      try {
        await access(file);
      } catch {
        return fail(
          "not-found",
          "The exported file is missing. It may have been moved or deleted.",
        );
      }
      deps.reveal(file);
      return { ok: true, value: true };
    },

    // Whether each exported row's file is still there, for the History page. Rows that are
    // not exported (or unknown ids) are left out.
    async exportFiles(ids: string[]): Promise<Record<string, ExportFileState>> {
      const repos = requireRepos();
      const root = deps.getRoot?.() ?? null;
      const result: Record<string, ExportFileState> = {};
      await Promise.all(
        ids.map(async (id) => {
          const video = repos.videos.get(id);
          if (!video || video.status !== "exported") {
            return;
          }
          if (!root || video.exportPath === null) {
            result[id] = "missing";
            return;
          }
          try {
            await access(toAbsolute(root, video.exportPath));
            result[id] = "present";
          } catch {
            result[id] = "missing";
          }
        }),
      );
      return result;
    },

    // Deletes the record. An exported video's file and sidecar are only touched when
    // `deleteFile` is set, and then they are moved to the Trash (never unlinked): the mp4
    // first, and the record stays if that fails so the user can retry; a sidecar that cannot
    // be trashed is only a warning. The record is deleted last. Caption use counts are not
    // decremented (DECISIONS #39).
    async remove(
      id: string,
      options: { deleteFile?: boolean } = {},
    ): Promise<VideoResult<RemovedVideo>> {
      const repos = requireRepos();
      const video = repos.videos.get(id);
      if (!video) {
        return fail("not-found", "That video no longer exists.");
      }
      if (deps.exports?.activeJobId(id)) {
        return fail("exporting", EXPORTING_MESSAGE);
      }
      let warning: string | null = null;
      if (
        options.deleteFile &&
        video.status === "exported" &&
        video.exportPath !== null
      ) {
        const outcome = await trashExportFiles(video.exportPath);
        if (!outcome.ok) {
          return outcome;
        }
        warning = outcome.value.warning;
      }
      repos.videos.remove(id);
      return { ok: true, value: { warning } };
    },
  };
  return service;
}

export type VideoService = ReturnType<typeof createVideoService>;
