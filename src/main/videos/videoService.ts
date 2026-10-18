import { access } from "node:fs/promises";
import type { Video, VideoStatus } from "../../shared/library";
import { checkRelativeLibraryPath } from "../../shared/libraryPaths";
import { isRenderable, type Recipe } from "../../shared/recipe";
import {
  ALREADY_EXPORTING_MESSAGE,
  EXPORTING_MESSAGE,
  NOT_A_DRAFT_MESSAGE,
  NOT_RENDERABLE_MESSAGE,
  PRODUCT_GONE_MESSAGE,
  type ExportStarted,
  type SavedDraft,
  type VideoError,
  type VideoResult,
} from "../../shared/videos";
import { toAbsolute } from "../db/libraryPaths";
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
};

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

    // Drafts and failed exports can be deleted here; an exported video's file and history stay.
    remove(id: string): VideoResult<true> {
      const repos = requireRepos();
      const video = repos.videos.get(id);
      if (!video) {
        return fail("not-found", "That draft no longer exists.");
      }
      if (video.status === "exported") {
        return fail("not-draft", NOT_A_DRAFT_MESSAGE);
      }
      if (deps.exports?.activeJobId(id)) {
        return fail("exporting", EXPORTING_MESSAGE);
      }
      repos.videos.remove(id);
      return { ok: true, value: true };
    },
  };
  return service;
}

export type VideoService = ReturnType<typeof createVideoService>;
