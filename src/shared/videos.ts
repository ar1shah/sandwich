// Draft saving: result types and payload schemas shared by main, preload and renderer.
import { z } from "zod";
import type { Video } from "./library";
import { RecipeSchema } from "./recipe";

export const VideoIdSchema = z.string().min(1).max(100);
export const RemoveVideoInputSchema = z.object({
  id: VideoIdSchema,
  // Exported videos only: also move the mp4 and its sidecar to the Trash.
  deleteFile: z.boolean().optional(),
});
export const ExportFilesInputSchema = z.array(VideoIdSchema).max(5000);
export const SaveDraftInputSchema = RecipeSchema;

export type VideoErrorCode =
  | "invalid"
  | "product-missing"
  | "not-draft"
  | "not-found"
  // Export: a slot has no clip yet.
  | "not-renderable"
  // Export: a render job for this video is already queued or running.
  | "already-exporting"
  // A save or delete while the video is being exported.
  | "exporting"
  // Delete: the exported file could not be moved to the Trash (the row is kept so the user
  // can retry), or its path is not inside the library's exports folder.
  | "delete-failed";

export type VideoError = {
  ok: false;
  code: VideoErrorCode;
  message: string;
};

export type VideoResult<T> = { ok: true; value: T } | VideoError;
export type SavedDraft = Pick<Video, "id" | "updatedAt">;

export const PRODUCT_GONE_MESSAGE =
  "That product no longer exists or was archived.";
export const NOT_A_DRAFT_MESSAGE = "That video is already exported.";
export const EXPORTING_MESSAGE =
  "This video is being exported. Wait for it to finish or cancel the export.";
export const NOT_RENDERABLE_MESSAGE =
  "Every slot needs a clip before this video can be exported.";
export const ALREADY_EXPORTING_MESSAGE = "This video is already exporting.";
export type ExportStarted = { jobId: string };

// Deleting a record. `warning` is set when the record is gone but something besides it did not
// go as planned (the sidecar could not be trashed).
export type RemovedVideo = { warning: string | null };

// Whether an exported row's file is still on disk.
export type ExportFileState = "present" | "missing";
