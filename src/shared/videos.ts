// Draft saving: result types and payload schemas shared by main, preload and renderer.
import { z } from "zod";
import type { Video } from "./library";
import { RecipeSchema } from "./recipe";

export const VideoIdSchema = z.string().min(1).max(100);
export const SaveDraftInputSchema = RecipeSchema;

export type VideoErrorCode =
  | "invalid"
  | "product-missing"
  | "not-draft"
  | "not-found";

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
