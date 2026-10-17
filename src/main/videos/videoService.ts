import type { Video, VideoStatus } from "../../shared/library";
import { checkRelativeLibraryPath } from "../../shared/libraryPaths";
import type { Recipe } from "../../shared/recipe";
import {
  NOT_A_DRAFT_MESSAGE,
  PRODUCT_GONE_MESSAGE,
  type SavedDraft,
  type VideoError,
  type VideoResult,
} from "../../shared/videos";
import type { Repos } from "../db/repos";

export type VideoServiceDeps = {
  // The active library, read per call (null = none open).
  getLibrary: () => { repos: Repos } | null;
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

  return {
    // `recipe` is already schema-valid (the IPC handler parses it). Media paths are
    // checked again here because they end up in a file path later.
    saveDraft(recipe: Recipe): VideoResult<SavedDraft> {
      const repos = requireRepos();
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
        if (existing.status !== "draft") {
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

    // Only drafts can be deleted here; an exported video's file and history stay.
    remove(id: string): VideoResult<true> {
      const repos = requireRepos();
      const video = repos.videos.get(id);
      if (!video) {
        return fail("not-found", "That draft no longer exists.");
      }
      if (video.status !== "draft") {
        return fail("not-draft", NOT_A_DRAFT_MESSAGE);
      }
      repos.videos.remove(id);
      return { ok: true, value: true };
    },
  };
}

export type VideoService = ReturnType<typeof createVideoService>;
