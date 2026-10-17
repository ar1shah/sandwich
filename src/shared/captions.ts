// Caption bank rules shared by the renderer (live validation) and main (the authority).
// Pure: no Node or DOM imports.
import { z } from "zod";
import { CAPTION_SLOTS, type CaptionSlot } from "./captionFilter";
import { resolveTokens, type TokenProduct } from "./tokens";

export const CAPTION_TEXT_MAX = 500;
// One bulk add. A pasted list longer than this is added in rounds (the rest stays in the box).
export const BULK_ADD_MAX = 200;

export const CAPTION_SLOT_LABELS: Record<CaptionSlot, string> = {
  before: "Before",
  after: "After",
  broll: "B-roll",
  any: "Any",
};

// Stands in for a product when none is picked or none exists yet, so token previews still
// show how {product} reads.
export const SAMPLE_TOKEN_PRODUCT: TokenProduct = {
  fullName: "Example Product",
  shortName: "the example",
};

export const CaptionIdSchema = z.string().min(1).max(100);
const CaptionSlotSchema = z.enum(CAPTION_SLOTS);
const CaptionProductIdSchema = z.string().min(1).max(100).nullable();

export const CaptionTextSchema = z
  .string()
  .trim()
  .min(1, "Enter the caption text.")
  .max(
    CAPTION_TEXT_MAX,
    `Keep the caption under ${CAPTION_TEXT_MAX} characters.`,
  );

export const CaptionFormSchema = z.object({
  text: CaptionTextSchema,
  slot: CaptionSlotSchema,
  // null = generic, usable with every product.
  productId: CaptionProductIdSchema,
});
export type CaptionForm = z.infer<typeof CaptionFormSchema>;

export const CreateCaptionInputSchema = CaptionFormSchema;
export type CreateCaptionInput = z.infer<typeof CreateCaptionInputSchema>;

// An edit sends only what changed; a missing field is left as it is.
export const CaptionPatchSchema = z.object({
  text: CaptionTextSchema.optional(),
  slot: CaptionSlotSchema.optional(),
  productId: CaptionProductIdSchema.optional(),
});
export type CaptionPatchInput = z.infer<typeof CaptionPatchSchema>;

export const UpdateCaptionInputSchema = z.object({
  id: CaptionIdSchema,
  patch: CaptionPatchSchema,
});
export type UpdateCaptionInput = z.infer<typeof UpdateCaptionInputSchema>;

export const BulkAddCaptionsInputSchema = z.object({
  productId: CaptionProductIdSchema,
  items: z
    .array(z.object({ slot: CaptionSlotSchema, text: CaptionTextSchema }))
    .min(1, "Nothing to add.")
    .max(BULK_ADD_MAX, `Add at most ${BULK_ADD_MAX} captions at a time.`),
});
export type BulkAddCaptionsInput = z.infer<typeof BulkAddCaptionsInputSchema>;

export type CaptionErrorCode = "invalid" | "not-found" | "product-missing";

export type CaptionError = {
  ok: false;
  code: CaptionErrorCode;
  message: string;
};
export type CaptionResult<T> = { ok: true; value: T } | CaptionError;

export const PRODUCT_MISSING_MESSAGE =
  "That product no longer exists or is archived. Pick another product or Generic.";

// Unknown tokens in a caption, as typed (with braces). Which product is used does not matter
// for this: only the token names are checked.
export function unknownTokens(text: string): string[] {
  return resolveTokens(text, SAMPLE_TOKEN_PRODUCT).unknownTokens;
}

export function unknownTokensMessage(tokens: readonly string[]): string {
  return `Unknown ${tokens.length === 1 ? "token" : "tokens"}: ${tokens.join(", ")}. Use {product}, {short} or {full}.`;
}

// ---- Duplicates ----------------------------------------------------------------------------

// Whitespace runs (including line breaks) collapse to one space and case is ignored, so
// "4 Weeks  later" and "4 weeks later" are the same caption.
export function normalizeCaptionText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export type DuplicateKey = {
  text: string;
  slot: CaptionSlot;
  productId: string | null;
};

export function captionKey(caption: DuplicateKey): string {
  return JSON.stringify([
    normalizeCaptionText(caption.text),
    caption.slot,
    caption.productId,
  ]);
}

// True when the bank already holds a caption with the same text (after normalizing), slot
// and product (null = generic). Used by bulk add and by the editor's "Save to bank".
export function isDuplicateCaption(
  candidate: DuplicateKey,
  existing: readonly DuplicateKey[],
): boolean {
  const key = captionKey(candidate);
  return existing.some((caption) => captionKey(caption) === key);
}
