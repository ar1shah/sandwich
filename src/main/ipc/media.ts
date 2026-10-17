import { readdir } from "node:fs/promises";
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import {
  DEV_IMPORT_FIXTURES_CHANNEL,
  MEDIA_IMPORT_UGC_CHANNEL,
} from "../../shared/ipc";
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

export function registerMediaIpc({
  jobs,
  assertTrustedSender,
  devFixturesDir,
}: {
  jobs: JobService;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
  // Set only in dev builds: the project's fixtures/ folder.
  devFixturesDir: string | null;
}): void {
  ipcMain.handle(MEDIA_IMPORT_UGC_CHANNEL, (event, filePaths: unknown) => {
    assertTrustedSender(event);
    return jobs.importUgc(ImportUgcInputSchema.parse(filePaths));
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
