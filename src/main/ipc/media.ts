import { readdir } from "node:fs/promises";
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { z } from "zod";
import {
  DEV_IMPORT_FIXTURES_CHANNEL,
  MEDIA_BY_PATHS_CHANNEL,
  MEDIA_GET_CHANNEL,
  MEDIA_IMPORT_UGC_CHANNEL,
} from "../../shared/ipc";
import type { MediaLookup } from "../media/mediaLookup";
import { hasImportExtension, ImportUgcInputSchema } from "../../shared/jobs";
import type { JobService } from "../jobs";

// Every importable clip directly inside `dir`, sorted for a stable order.
async function clipsIn(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  return names
    .filter((name) => hasImportExtension(name))
    .sort()
    .map((name) => path.join(dir, name));
}

const MediaIdSchema = z.string().min(1).max(100);
const PathsSchema = z.array(z.string().min(1).max(1024)).max(10);

export function registerMediaIpc({
  jobs,
  lookup,
  assertTrustedSender,
  devFixturesDir,
}: {
  jobs: JobService;
  lookup: MediaLookup;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
  // Set only in dev builds: the project's fixtures/ folder.
  devFixturesDir: string | null;
}): void {
  ipcMain.handle(MEDIA_IMPORT_UGC_CHANNEL, (event, filePaths: unknown) => {
    assertTrustedSender(event);
    return jobs.importUgc(ImportUgcInputSchema.parse(filePaths));
  });

  ipcMain.handle(MEDIA_GET_CHANNEL, (event, id: unknown) => {
    assertTrustedSender(event);
    return lookup.get(MediaIdSchema.parse(id));
  });
  ipcMain.handle(MEDIA_BY_PATHS_CHANNEL, (event, paths: unknown) => {
    assertTrustedSender(event);
    return lookup.byPaths(PathsSchema.parse(paths));
  });

  if (devFixturesDir) {
    // Main picks the files, so the renderer never sends a path for this.
    ipcMain.handle(DEV_IMPORT_FIXTURES_CHANNEL, async (event) => {
      assertTrustedSender(event);
      const files = [
        ...(await clipsIn(devFixturesDir)),
        ...(await clipsIn(path.join(devFixturesDir, "real"))),
      ];
      if (files.length === 0) {
        throw new Error("No clips in fixtures/. Run npm run fixtures first.");
      }
      return jobs.importUgc(files);
    });
  }
}
