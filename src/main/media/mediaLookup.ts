import { stat } from "node:fs/promises";
import type { Media } from "../../shared/library";
import { checkRelativeLibraryPath } from "../../shared/libraryPaths";
import type { MediaPathCheck } from "../../shared/mediaLookup";
import type { Repos } from "../db/repos";
import { toAbsolute } from "../db/libraryPaths";

export type MediaLookupDeps = {
  getLibrary: () => { root: string; repos: Repos } | null;
};

async function isFile(absolute: string): Promise<boolean> {
  try {
    return (await stat(absolute)).isFile();
  } catch {
    return false;
  }
}

// Read-only lookups the editor needs: a media row by id, and whether the clips of a
// restored draft still exist (row AND file). No Electron imports.
export function createMediaLookup(deps: MediaLookupDeps) {
  function requireLibrary() {
    const library = deps.getLibrary();
    if (!library) {
      throw new Error("Open a library before using media.");
    }
    return library;
  }

  return {
    get(id: string): Media | null {
      return requireLibrary().repos.media.get(id);
    },

    async byPaths(paths: string[]): Promise<MediaPathCheck[]> {
      const { root, repos } = requireLibrary();
      // One scan of the (small) media table instead of a query per path.
      const byPath = new Map(repos.media.list().map((m) => [m.path, m]));
      return Promise.all(
        paths.map(async (relative): Promise<MediaPathCheck> => {
          // An unsafe path is simply "not there"; it is never stat-ed.
          if (!checkRelativeLibraryPath(relative).ok) {
            return { path: relative, media: null, fileExists: false };
          }
          return {
            path: relative,
            media: byPath.get(relative) ?? null,
            fileExists: await isFile(toAbsolute(root, relative)),
          };
        }),
      );
    },
  };
}

export type MediaLookup = ReturnType<typeof createMediaLookup>;
