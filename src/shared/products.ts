// Product form rules shared by the renderer (live validation) and main (the authority).
// Pure: no Node or DOM imports.
import { z } from "zod";
import type { Product } from "./library";
import { isWindowsReservedName, slugify } from "./slug";

export const PRODUCT_FULL_NAME_MAX = 120;
export const PRODUCT_SHORT_NAME_MAX = 60;
export const PRODUCT_SLUG_MAX = 60;
// Photos are re-encoded to at most this long edge on save.
export const PRODUCT_IMAGE_MAX_EDGE = 800;
// Raw upload cap. A phone photo is a few MB; this is far above that and far below an IPC problem.
export const PRODUCT_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const FullNameSchema = z
  .string()
  .trim()
  .min(1, "Enter the product name.")
  .max(
    PRODUCT_FULL_NAME_MAX,
    `Keep the name under ${PRODUCT_FULL_NAME_MAX} characters.`,
  );

// Empty text means "no short name" and is stored as null.
const ShortNameSchema = z
  .string()
  .trim()
  .max(
    PRODUCT_SHORT_NAME_MAX,
    `Keep it under ${PRODUCT_SHORT_NAME_MAX} characters.`,
  )
  .nullable()
  .transform((value) => (value ? value : null));

export const ProductSlugSchema = z
  .string()
  .trim()
  .min(1, "Enter a slug.")
  .max(PRODUCT_SLUG_MAX, `Keep the slug under ${PRODUCT_SLUG_MAX} characters.`)
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single dashes.")
  .refine((slug) => !isWindowsReservedName(slug), "That name is reserved.");

export const ProductFormSchema = z.object({
  fullName: FullNameSchema,
  shortName: ShortNameSchema,
  slug: ProductSlugSchema,
});
export type ProductForm = z.infer<typeof ProductFormSchema>;

// An edit sends only what changed; a missing field is left as it is. In particular a new
// full name never changes the slug on its own (exports already live under the old one).
export const ProductPatchSchema = z.object({
  fullName: FullNameSchema.optional(),
  shortName: ShortNameSchema.optional(),
  slug: ProductSlugSchema.optional(),
});
export type ProductPatchInput = z.infer<typeof ProductPatchSchema>;

// The image bytes as read from a File in the renderer. Type and content are checked in main.
export const ProductImageBytesSchema = z
  .instanceof(Uint8Array)
  .refine((bytes) => bytes.byteLength > 0, "That file is empty.")
  .refine(
    (bytes) => bytes.byteLength <= PRODUCT_IMAGE_MAX_BYTES,
    "That image is too large (25 MB at most).",
  );

export const CreateProductInputSchema = z.object({
  form: ProductFormSchema,
  image: ProductImageBytesSchema.optional(),
});
export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;
// What the renderer sends (before trimming and the empty-short-name rule).
export type CreateProductRequest = z.input<typeof CreateProductInputSchema>;

export const UpdateProductInputSchema = z.object({
  id: z.string().min(1),
  patch: ProductPatchSchema,
  image: ProductImageBytesSchema.optional(),
  removeImage: z.boolean().optional(),
});
export type UpdateProductInput = z.infer<typeof UpdateProductInputSchema>;
export type UpdateProductRequest = z.input<typeof UpdateProductInputSchema>;

export const ProductIdSchema = z.string().min(1);

// A product row plus what deleting it would take with it.
export type ProductSummary = Product & {
  brollCount: number;
  captionCount: number;
  videoCount: number;
};

export type ProductErrorField = "fullName" | "shortName" | "slug" | "image";
export type ProductErrorCode =
  | "slug-taken"
  | "slug-taken-archived"
  | "bad-image"
  | "has-videos"
  | "not-found"
  | "invalid";

export type ProductError = {
  ok: false;
  code: ProductErrorCode;
  // The form field to show it under; null = a general message.
  field: ProductErrorField | null;
  message: string;
  // has-videos only.
  videoCount?: number;
};
export type ProductResult<T> = { ok: true; value: T } | ProductError;

export const BAD_IMAGE_MESSAGE = "Use a JPG, PNG or WebP image.";

// Slug suggested from the full name (create mode).
export function suggestSlug(fullName: string): string {
  return slugify(fullName, {
    maxLength: PRODUCT_SLUG_MAX,
    fallback: "product",
  });
}

// `base` if free, else base-2, base-3, ... The suffix is kept inside the length cap by
// trimming the base. Pass every slug in the library, archived products included.
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) {
    return base;
  }
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const stem = base
      .slice(0, PRODUCT_SLUG_MAX - suffix.length)
      .replace(/-+$/g, "");
    const candidate = `${stem}${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}

export type SlugConflict = { archived: boolean };

// Another product already uses `slug`. The product being edited (`ownId`) never conflicts
// with itself. `archived` says the owner is hidden, so the message can explain it.
export function slugConflict(
  slug: string,
  products: readonly Pick<Product, "id" | "slug" | "archivedAt">[],
  ownId?: string,
): SlugConflict | null {
  const other = products.find((p) => p.slug === slug && p.id !== ownId);
  return other ? { archived: other.archivedAt !== null } : null;
}

export function slugConflictMessage(conflict: SlugConflict): string {
  return conflict.archived
    ? "That slug is used by an archived product."
    : "That slug is used by another product.";
}
