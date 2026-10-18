// Which import jobs show as placeholder tiles on a product's b-roll page. Pure.
import { importedMediaId, type JobInfo } from "./jobs";

export type BrollPlaceholder = {
  jobId: string;
  label: string;
  // "progress": queued or running. "error": failed, stays until dismissed.
  kind: "progress" | "error";
  percent: number;
  stage?: string;
  // error only: short text for the tile.
  message?: string;
  // "queued" tiles show "Waiting" instead of a stage.
  queued: boolean;
};

// "ffmpeg exited with code 1: ..." is for logs. The tile shows the first line, trimmed.
export const PLACEHOLDER_MESSAGE_MAX = 90;

export function shortJobError(error: string | undefined): string {
  const firstLine = (error ?? "").split(/\r?\n/)[0]?.trim() ?? "";
  if (!firstLine) {
    return "Import failed.";
  }
  return firstLine.length > PLACEHOLDER_MESSAGE_MAX
    ? `${firstLine.slice(0, PLACEHOLDER_MESSAGE_MAX - 1)}…`
    : firstLine;
}

// queued/running/cancelling -> progress tile. failed -> error tile until its id is in
// `dismissed`. cancelled -> no tile. done -> a "Finishing" tile until its clip is in the
// loaded list (`loadedIds`), so the tile does not blink out before the real one appears.
// Tiles keep enqueue order.
export function brollPlaceholders(
  jobs: readonly JobInfo[],
  productId: string,
  dismissed: ReadonlySet<string>,
  loadedIds: ReadonlySet<string> = new Set(),
): BrollPlaceholder[] {
  return jobs
    .filter((job) => job.type === "importClip" && job.productId === productId)
    .sort((a, b) => a.order - b.order)
    .flatMap((job): BrollPlaceholder[] => {
      switch (job.state) {
        case "queued":
        case "running":
        case "cancelling":
          return [
            {
              jobId: job.id,
              label: job.label,
              kind: "progress",
              percent: job.percent,
              stage: job.stage,
              queued: job.state === "queued",
            },
          ];
        case "failed":
          return dismissed.has(job.id)
            ? []
            : [
                {
                  jobId: job.id,
                  label: job.label,
                  kind: "error",
                  percent: job.percent,
                  message: shortJobError(job.error),
                  queued: false,
                },
              ];
        case "done":
          return importedMediaId(job.result) !== undefined &&
            !loadedIds.has(importedMediaId(job.result) ?? "")
            ? [
                {
                  jobId: job.id,
                  label: job.label,
                  kind: "progress",
                  percent: 100,
                  stage: "Finishing",
                  queued: false,
                },
              ]
            : [];
        default:
          return [];
      }
    });
}
