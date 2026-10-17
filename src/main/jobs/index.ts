import { randomUUID } from "node:crypto";
import { fileBaseName, type JobEvent, type JobInfo } from "../../shared/jobs";
import { createJobScheduler } from "../../shared/jobScheduler";
import type { Repos } from "../db/repos";
import {
  createFfmpegSteps,
  importClip,
  type ImportSteps,
  type ImportTarget,
} from "./importClip";

// A b-roll import the user can fix (the product is gone or archived), as opposed to a bug.
export class ImportRejectedError extends Error {
  constructor(
    readonly code: "not-found" | "archived",
    message: string,
  ) {
    super(message);
    this.name = "ImportRejectedError";
  }
}

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

  // The one place import jobs are built, so UGC and b-roll cannot drift. The library is
  // captured now, so a job keeps writing to the library it was started in.
  function enqueueImports(
    target: ImportTarget,
    filePaths: readonly string[],
  ): string[] {
    const library = deps.getLibrary();
    if (!library) {
      throw new Error("Open a library before importing clips.");
    }
    const { root, repos } = library;
    if (target.kind === "broll") {
      const product = repos.products.get(target.productId);
      if (!product) {
        throw new ImportRejectedError(
          "not-found",
          "That product no longer exists.",
        );
      }
      if (product.archivedAt !== null) {
        throw new ImportRejectedError(
          "archived",
          "That product is archived, so it cannot take new b-roll.",
        );
      }
    }
    return filePaths.map((filePath) =>
      scheduler.enqueue({
        type: "importClip",
        label: `Importing ${fileBaseName(filePath)}`,
        ...(target.kind === "broll" ? { productId: target.productId } : {}),
        run: (context) =>
          importClip(filePath, context, {
            target,
            root,
            repos,
            steps,
            now,
            newId,
          }),
      }),
    );
  }

  return {
    // Queues one importClip job per file. Returns the job ids.
    importUgc: (filePaths: readonly string[]): string[] =>
      enqueueImports({ kind: "ugc" }, filePaths),
    // Same, into one product's b-roll library. Throws for a missing or archived product.
    importBroll: (productId: string, filePaths: readonly string[]): string[] =>
      enqueueImports({ kind: "broll", productId }, filePaths),
    cancel: (jobId: string): boolean => scheduler.cancel(jobId),
    cancelAll: (): Promise<void> => scheduler.cancelAll(),
    hasActive: (): boolean => scheduler.hasActive(),
    hasActiveForProduct: (productId: string): boolean =>
      scheduler.hasActiveForProduct(productId),
    list: (): JobInfo[] => scheduler.snapshot(),
  };
}

export type JobService = ReturnType<typeof createJobService>;
