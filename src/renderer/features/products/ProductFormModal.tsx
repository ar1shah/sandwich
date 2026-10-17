import { useId, useMemo, useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import { resolveTokens } from "../../../shared/tokens";
import {
  BAD_IMAGE_MESSAGE,
  PRODUCT_IMAGE_MAX_BYTES,
  ProductFormSchema,
  slugConflict,
  slugConflictMessage,
  suggestSlug,
  uniqueSlug,
  type ProductErrorField,
  type ProductSummary,
} from "../../../shared/products";
import { readImagePreview } from "./imagePreview";
import { productImageUrl } from "./productImageUrl";
import { useProductsStore } from "./productsStore";

export type ProductFormMode =
  | { kind: "create" }
  | { kind: "edit"; product: ProductSummary };

type FieldErrors = Partial<Record<ProductErrorField | "general", string>>;

const INPUT =
  "w-full rounded-md border border-edge bg-app px-3 py-2 text-sm outline-none placeholder:text-app-dim focus:border-brand";
const PRIMARY =
  "rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";
const SECONDARY =
  "rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:bg-white/5 disabled:opacity-50";

const FieldError: React.FC<{ id: string; message?: string }> = ({
  id,
  message,
}) =>
  message ? (
    <p id={id} role="alert" className="mt-1 text-xs text-red-400">
      {message}
    </p>
  ) : null;

export const ProductFormModal: React.FC<{
  mode: ProductFormMode;
  onClose: () => void;
}> = ({ mode, onClose }) => {
  const products = useProductsStore((s) => s.products);
  const mediaBase = useProductsStore((s) => s.mediaBase);
  const createProduct = useProductsStore((s) => s.create);
  const updateProduct = useProductsStore((s) => s.update);

  const editing = mode.kind === "edit" ? mode.product : null;
  const ids = {
    name: useId(),
    short: useId(),
    slug: useId(),
    image: useId(),
  };
  const fileInput = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(editing?.fullName ?? "");
  const [shortName, setShortName] = useState(editing?.shortName ?? "");
  // null = follow the suggestion (create) or keep the stored slug (edit).
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ file: File; preview: string } | null>(
    null,
  );
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Every slug in the library, archived ones included, except this product's own.
  const takenSlugs = useMemo(
    () => products.filter((p) => p.id !== editing?.id).map((p) => p.slug),
    [products, editing?.id],
  );
  const suggestion = fullName.trim()
    ? uniqueSlug(suggestSlug(fullName), takenSlugs)
    : "";
  const slug = slugOverride ?? (editing ? editing.slug : suggestion);
  const slugChanged = editing !== null && slug !== editing.slug;

  const parsed = ProductFormSchema.safeParse({ fullName, shortName, slug });
  const conflict = slugConflict(slug, products, editing?.id);
  const formErrors: FieldErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in formErrors)) {
        formErrors[key as ProductErrorField] = issue.message;
      }
    }
  }
  if (conflict && !formErrors.slug) {
    formErrors.slug = slugConflictMessage(conflict);
  }
  const showSlugError = attempted || slugOverride !== null;
  const errors: FieldErrors = {
    ...(attempted ? formErrors : {}),
    ...(!attempted && showSlugError && formErrors.slug
      ? { slug: formErrors.slug }
      : {}),
    ...(imageError ? { image: imageError } : {}),
    ...serverErrors,
  };

  const preview = resolveTokens("10/10 {product}", {
    fullName: fullName.trim() || "Your product",
    shortName,
  }).text;

  const currentImageUrl =
    picked?.preview ??
    (editing && !removeImage ? productImageUrl(mediaBase, editing) : null);

  function clearServerError(field: ProductErrorField | "general") {
    setServerErrors((current) => {
      if (!(field in current)) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function acceptFile(file: File | undefined) {
    if (!file) {
      return;
    }
    clearServerError("image");
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      setImageError("That image is too large (25 MB at most).");
      return;
    }
    try {
      // main checks the real type; this only has to be something the page can show.
      setPicked({ file, preview: await readImagePreview(file) });
      setRemoveImage(false);
      setImageError(null);
    } catch {
      setImageError(BAD_IMAGE_MESSAGE);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (submitting || !parsed.success || conflict) {
      return;
    }
    setSubmitting(true);
    setServerErrors({});
    try {
      const image = picked
        ? new Uint8Array(await picked.file.arrayBuffer())
        : undefined;
      const result = editing
        ? await updateProduct({
            id: editing.id,
            patch: {
              fullName: parsed.data.fullName,
              shortName: parsed.data.shortName,
              // Only an explicit slug edit changes the slug; renaming never does.
              ...(slugChanged ? { slug: parsed.data.slug } : {}),
            },
            image,
            removeImage: removeImage && !image ? true : undefined,
          })
        : await createProduct({ form: parsed.data, image });
      if (result.ok) {
        onClose();
      } else {
        setServerErrors({ [result.field ?? "general"]: result.message });
      }
    } catch (error) {
      setServerErrors({
        general: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit product" : "Add product"}
      onClose={onClose}
      busy={submitting}
    >
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="mt-5 space-y-5"
      >
        <div>
          <span className="mb-1.5 block text-sm font-medium">Photo</span>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void acceptFile(event.dataTransfer.files[0]);
            }}
            className={
              "flex items-center gap-4 rounded-lg border border-dashed p-3 transition-colors " +
              (dragging ? "border-brand bg-brand/10" : "border-edge")
            }
          >
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/30 text-xs text-app-dim">
              {currentImageUrl ? (
                <img
                  src={currentImageUrl}
                  alt="Product photo preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                "No photo"
              )}
            </div>
            <div className="min-w-0 text-sm">
              <p className="text-app-muted">
                Drop a photo here, or{" "}
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="text-brand underline-offset-2 hover:underline"
                >
                  choose a file
                </button>
                .
              </p>
              <p className="mt-1 text-xs text-app-dim">
                JPG, PNG or WebP. It is resized to 800 px.
              </p>
              {editing && (picked || (editing.imagePath && !removeImage)) && (
                <button
                  type="button"
                  onClick={() => {
                    setPicked(null);
                    setRemoveImage(editing.imagePath !== null);
                    setImageError(null);
                    clearServerError("image");
                  }}
                  className="mt-2 text-xs text-app-muted hover:text-app-text"
                >
                  {picked ? "Discard new photo" : "Remove photo"}
                </button>
              )}
            </div>
            <input
              ref={fileInput}
              id={ids.image}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Product photo file"
              className="hidden"
              onChange={(event) => {
                void acceptFile(event.target.files?.[0]);
                // Allow choosing the same file again after an error.
                event.target.value = "";
              }}
            />
          </div>
          <FieldError id={`${ids.image}-error`} message={errors.image} />
        </div>

        <div>
          <label
            htmlFor={ids.name}
            className="mb-1.5 block text-sm font-medium"
          >
            Full name
          </label>
          <input
            id={ids.name}
            autoFocus
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
              clearServerError("fullName");
            }}
            placeholder="Levi's 501 Original Fit Jeans"
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? `${ids.name}-error` : undefined}
            className={INPUT}
          />
          <FieldError id={`${ids.name}-error`} message={errors.fullName} />
        </div>

        <div>
          <label
            htmlFor={ids.short}
            className="mb-1.5 block text-sm font-medium"
          >
            Short name{" "}
            <span className="font-normal text-app-dim">(optional)</span>
          </label>
          <input
            id={ids.short}
            value={shortName}
            onChange={(event) => {
              setShortName(event.target.value);
              clearServerError("shortName");
            }}
            placeholder="the 501s"
            aria-describedby={`${ids.short}-hint`}
            className={INPUT}
          />
          <p id={`${ids.short}-hint`} className="mt-1 text-xs text-app-dim">
            What you&apos;d say in a caption, e.g. &apos;the 501s&apos;.
          </p>
          <FieldError id={`${ids.short}-error`} message={errors.shortName} />
          <p
            className="mt-2 rounded-md bg-white/5 px-3 py-2 text-xs text-app-muted"
            data-testid="caption-preview"
          >
            A caption written as{" "}
            <span className="font-mono text-app-text">10/10 {"{product}"}</span>{" "}
            becomes <span className="font-medium text-app-text">{preview}</span>
          </p>
        </div>

        <div>
          <label
            htmlFor={ids.slug}
            className="mb-1.5 block text-sm font-medium"
          >
            Slug
          </label>
          <input
            id={ids.slug}
            value={slug}
            onChange={(event) => {
              setSlugOverride(event.target.value);
              clearServerError("slug");
            }}
            spellCheck={false}
            aria-invalid={errors.slug ? true : undefined}
            aria-describedby={errors.slug ? `${ids.slug}-error` : undefined}
            className={`${INPUT} font-mono`}
          />
          <p className="mt-1 text-xs text-app-dim">
            Used in export file and folder names.
            {editing
              ? " It stays the same when you rename the product."
              : " It follows the name until you edit it."}
            {!editing && slugOverride !== null && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setSlugOverride(null)}
                  className="text-brand hover:underline"
                >
                  Use suggestion
                </button>
              </>
            )}
          </p>
          {editing && slugChanged && editing.videoCount > 0 && (
            <p
              role="note"
              className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
            >
              This product has exported videos. They stay in the old folder
              (exports/{editing.slug}); only new exports use the new slug.
            </p>
          )}
          <FieldError id={`${ids.slug}-error`} message={errors.slug} />
        </div>

        {errors.general && (
          <p role="alert" className="text-sm text-red-400">
            {errors.general}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={SECONDARY}
          >
            Cancel
          </button>
          <button type="submit" disabled={submitting} className={PRIMARY}>
            {submitting
              ? "Saving..."
              : editing
                ? "Save changes"
                : "Add product"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
