// B-roll API results shared by main and the renderer. Pure.
import { z } from "zod";

export type BrollErrorCode = "not-found" | "archived";

export type BrollError = {
  ok: false;
  code: BrollErrorCode;
  message: string;
};
export type BrollResult<T> = { ok: true; value: T } | BrollError;

export const BrollIdSchema = z.string().min(1).max(100);
