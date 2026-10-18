// Job queue types shared by main, preload and renderer (ARCHITECTURE section 2, jobs).
// Types, constants and zod schemas only: no Node or DOM imports.
import { z } from "zod";

// Both types have a runner (importClip: jobs/importClip.ts, render: render/exportVideo.ts).
export const JOB_TYPES = ["importClip", "render"] as const;
export type JobType = (typeof JOB_TYPES)[number];

// Max jobs of one type running at once. importClip is the "normalize" class of
// ARCHITECTURE section 2 (its thumbnail and filmstrip stages are short and stay inside it).
export const JOB_LIMITS: Record<JobType, number> = {
  importClip: 2,
  render: 1,
};

export const JOB_STATES = [
  "queued",
  "running",
  // Abort requested, runner not settled yet. Still holds its pool slot.
  "cancelling",
  "done",
  "failed",
  "cancelled",
] as const;
export type JobState = (typeof JOB_STATES)[number];

export function isTerminalJobState(state: JobState): boolean {
  return state === "done" || state === "failed" || state === "cancelled";
}

// What a finished render job hands back. `warnings` are the soft verify checks that failed
// (DECISIONS #38): the file was exported anyway.
export type ExportJobResult = {
  videoId: string;
  // Relative to the library root, forward slashes.
  exportPath: string;
  warnings: string[];
};

// What a finished job hands back. importClip: the new media row, so a caller can bind a
// dropped clip to its slot. render: the exported video.
export type JobResult = { mediaId: string } | ExportJobResult;

// The media row an importClip job created, or undefined for any other result.
export function importedMediaId(
  result: JobResult | undefined,
): string | undefined {
  return result && "mediaId" in result ? result.mediaId : undefined;
}

export function isExportJobResult(
  result: JobResult | undefined,
): result is ExportJobResult {
  return result !== undefined && "videoId" in result;
}

export type JobInfo = {
  id: string;
  type: JobType;
  // Human label for the tray, e.g. "Importing IMG_1234.MOV".
  label: string;
  state: JobState;
  // 0..100, never goes down.
  percent: number;
  stage?: string;
  error?: string;
  result?: JobResult;
  // Set on b-roll imports: the product the clip is being added to. Lets the product page
  // show placeholder tiles and lets product delete refuse while an import is running.
  productId?: string;
  // Scheduler-wide counter, bumped on every event. A higher seq for the same id is newer,
  // so a stale snapshot can never overwrite a newer event.
  seq: number;
  // Enqueue order. Never changes, so lists stay in a stable order while progress ticks.
  order: number;
  updatedAt: string;
};

export const JOB_EVENT_TYPES = [
  "queued",
  "started",
  "progress",
  "done",
  "failed",
  "cancelled",
] as const;
export type JobEventType = (typeof JOB_EVENT_TYPES)[number];

export type JobEvent = { type: JobEventType; job: JobInfo };

// Every event type except `progress` marks a state change and must never be dropped.
export function isProgressEvent(event: JobEvent): boolean {
  return event.type === "progress";
}

export function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// Containers an iPhone, Android or screen recorder gives us. Matched case-insensitively
// (IMG_1234.MOV).
export const IMPORT_EXTENSIONS = [".mp4", ".mov", ".m4v"] as const;

export function hasImportExtension(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return IMPORT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// "/a/b", "C:\a\b" or "C:/a/b", "\\server\share". Shared code has no `path`, so this is
// a syntactic check; main resolves and stats the file.
function isAbsoluteLike(filePath: string): boolean {
  return (
    filePath.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(filePath) ||
    filePath.startsWith("\\\\")
  );
}

export const MAX_IMPORT_FILES = 200;

const ImportPathsSchema = z
  .array(
    z
      .string()
      .min(1)
      .refine(isAbsoluteLike, "Path must be absolute.")
      .refine(
        hasImportExtension,
        `Unsupported file type (use ${IMPORT_EXTENSIONS.join(", ")}).`,
      ),
  )
  .min(1)
  .max(MAX_IMPORT_FILES);

export const ImportUgcInputSchema = ImportPathsSchema;

export const ImportBrollInputSchema = z.object({
  productId: z.string().min(1).max(100),
  filePaths: ImportPathsSchema,
});
export type ImportBrollInput = z.infer<typeof ImportBrollInputSchema>;

export const JobIdSchema = z.string().min(1).max(100);

// Last path segment, either separator.
export function fileBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}
