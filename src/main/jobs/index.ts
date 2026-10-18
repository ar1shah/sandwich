import { randomUUID } from "node:crypto";
import {
  fileBaseName,
  isTerminalJobState,
  type JobEvent,
  type JobInfo,
} from "../../shared/jobs";
import { createJobScheduler } from "../../shared/jobScheduler";
import type { Recipe } from "../../shared/recipe";
import type { Repos } from "../db/repos";
import {
  ExportRejectedError,
  exportVideo,
  type ExportDeps,
} from "../render/exportVideo";
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
  // The render and verify steps of an export (the app wires renderRecipe and verifyRender).
  // Without them exportVideo() throws.
  exporter?: Pick<ExportDeps, "render" | "verify">;
  now?: () => Date;
  newId?: () => string;
};

// The app's job queue: the pure scheduler plus the real runners. No Electron imports, so
// scripts/test-import.ts runs the same code headless.
export function createJobService(deps: JobServiceDeps) {
  const scheduler = createJobScheduler({
    enabledTypes: ["importClip", "render"],
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

  // videoId -> the render job that exports it. Entries are never removed: a stale one is
  // simply a job in a terminal state (or one that no longer exists), see activeExportJobId.
  const exportJobs = new Map<string, string>();

  function activeExportJobId(videoId: string): string | null {
    const jobId = exportJobs.get(videoId);
    if (!jobId) {
      return null;
    }
    const job = scheduler.snapshot().find((entry) => entry.id === jobId);
    return job && !isTerminalJobState(job.state) ? jobId : null;
  }

  // Queues one render job for a draft that is already saved. Returns the job id.
  function enqueueExport(recipe: Recipe): string {
    const library = deps.getLibrary();
    if (!library) {
      throw new Error("Open a library before exporting.");
    }
    if (!deps.exporter) {
      throw new Error("Exporting is not set up.");
    }
    if (activeExportJobId(recipe.id)) {
      throw new ExportRejectedError(
        "already-exporting",
        "This video is already exporting.",
      );
    }
    const { root, repos } = library;
    const product = repos.products.get(recipe.productId);
    if (!product) {
      throw new ExportRejectedError(
        "not-found",
        "That product no longer exists.",
      );
    }
    const { render, verify } = deps.exporter;
    const jobId = scheduler.enqueue({
      type: "render",
      label: `Exporting ${product.shortName ?? product.fullName}`,
      productId: product.id,
      run: (context) =>
        exportVideo(recipe, context, { root, repos, render, verify, now }),
    });
    exportJobs.set(recipe.id, jobId);
    return jobId;
  }

  return {
    // Queues one render job for the draft `recipe` (already saved). Throws
    // ExportRejectedError when the product is gone or this video is already exporting.
    exportVideo: enqueueExport,
    // The queued or running export job of this video, or null.
    activeExportJobId,
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
