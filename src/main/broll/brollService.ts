import { rm } from "node:fs/promises";
import type { BrollResult } from "../../shared/broll";
import type { Media } from "../../shared/library";
import { toAbsolute } from "../db/libraryPaths";
import type { Repos } from "../db/repos";
import { ImportRejectedError, type JobService } from "../jobs";

export type BrollServiceDeps = {
  // The active library, read per call (null = none open).
  getLibrary: () => { root: string; repos: Repos } | null;
  jobs: Pick<JobService, "importBroll">;
};

// A product's b-roll: list, queue imports, delete. No Electron imports.
export function createBrollService(deps: BrollServiceDeps) {
  function requireLibrary(): { root: string; repos: Repos } {
    const library = deps.getLibrary();
    if (!library) {
      throw new Error("Open a library before using b-roll.");
    }
    return library;
  }

  return {
    list(productId: string): Media[] {
      const { repos } = requireLibrary();
      return repos.media.list({ kind: "broll", productId });
    },

    importFiles(
      productId: string,
      filePaths: readonly string[],
    ): BrollResult<string[]> {
      try {
        return { ok: true, value: deps.jobs.importBroll(productId, filePaths) };
      } catch (error) {
        if (error instanceof ImportRejectedError) {
          return { ok: false, code: error.code, message: error.message };
        }
        throw error;
      }
    },

    // Row first, then the files (best effort), like a product delete: a failed rm leaves
    // an orphan file at worst, never a row pointing at nothing. Recipes do not exist yet,
    // so nothing checks whether a video uses this clip (DECISIONS #31).
    async remove(id: string): Promise<BrollResult<true>> {
      const { root, repos } = requireLibrary();
      const media = repos.media.get(id);
      if (!media || media.kind !== "broll") {
        return {
          ok: false,
          code: "not-found",
          message: "That b-roll clip no longer exists.",
        };
      }
      repos.media.remove(id);
      const files = [media.path, media.thumbPath, media.filmstripPath];
      await Promise.all(
        files.map((file) =>
          file
            ? rm(toAbsolute(root, file), { force: true }).catch(() => undefined)
            : undefined,
        ),
      );
      return { ok: true, value: true };
    },
  };
}

export type BrollService = ReturnType<typeof createBrollService>;
