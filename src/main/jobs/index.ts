import { randomUUID } from "node:crypto";
import { fileBaseName, type JobEvent, type JobInfo } from "../../shared/jobs";
import { createJobScheduler } from "../../shared/jobScheduler";
import type { Repos } from "../db/repos";
import { createFfmpegSteps, importClip, type ImportSteps } from "./importClip";

export type JobServiceDeps = {
  // The active library, read when a job is enqueued (null = none open).
  getLibrary: () => { root: string; repos: Repos } | null;
  onEvent: (event: JobEvent) => void;
  // Defaults to the ffmpeg-backed steps with the dev binaries; the app passes its own.
  steps?: ImportSteps;
  now?: () => Date;
  newId?: () => string;
};

// The app's job queue: the pure scheduler plus the real runners. No Electron imports, so
// scripts/test-import.ts runs the same code headless.
export function createJobService(deps: JobServiceDeps) {
  const scheduler = createJobScheduler({
    // render joins in 3.5.
    enabledTypes: ["importClip"],
    onEvent: deps.onEvent,
    newId: () => randomUUID(),
  });
  const steps = deps.steps ?? createFfmpegSteps();
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => randomUUID());

  return {
    // Queues one importClip job per file. The library is captured now, so a job keeps
    // writing to the library it was started in.
    importUgc(filePaths: readonly string[]): string[] {
      const library = deps.getLibrary();
      if (!library) {
        throw new Error("Open a library before importing clips.");
      }
      const { root, repos } = library;
      return filePaths.map((filePath) =>
        scheduler.enqueue({
          type: "importClip",
          label: `Importing ${fileBaseName(filePath)}`,
          run: (context) =>
            importClip(filePath, context, { root, repos, steps, now, newId }),
        }),
      );
    },
    cancel: (jobId: string): boolean => scheduler.cancel(jobId),
    cancelAll: (): Promise<void> => scheduler.cancelAll(),
    hasActive: (): boolean => scheduler.hasActive(),
    list: (): JobInfo[] => scheduler.snapshot(),
  };
}

export type JobService = ReturnType<typeof createJobService>;
