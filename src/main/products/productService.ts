import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectImageType } from "../../shared/imageType";
import {
  jobTmpDir,
  productDir,
  productImagePath,
} from "../../shared/importPaths";
import {
  BAD_IMAGE_MESSAGE,
  slugConflictMessage,
  type CreateProductInput,
  type ProductError,
  type ProductErrorCode,
  type ProductErrorField,
  type ProductResult,
  type ProductSummary,
  type UpdateProductInput,
} from "../../shared/products";
import { ProductHasVideosError, SlugTakenError } from "../db/errors";
import { toAbsolute } from "../db/libraryPaths";
import type { Repos } from "../db/repos";

export type ProductServiceDeps = {
  // The active library, read per call (null = none open).
  getLibrary: () => { root: string; repos: Repos } | null;
  // Turns an image file into the product JPEG. Injectable so tests can fake it.
  processImage: (input: string, output: string) => Promise<void>;
  newId?: () => string;
};

const UNREADABLE_IMAGE_MESSAGE =
  "That image could not be read. Try a different file.";

function fail(
  code: ProductErrorCode,
  field: ProductErrorField | null,
  message: string,
  extra: Partial<ProductError> = {},
): ProductError {
  return { ok: false, code, field, message, ...extra };
}

const SOURCE_EXTENSION = { jpeg: "jpg", png: "png", webp: "webp" } as const;

// Product rows plus the files under products/<id>/. Owns the order of file and database
// work so a failure never leaves a half-made product or a changed image behind
// (DECISIONS #30). No Electron imports.
export function createProductService(deps: ProductServiceDeps) {
  const newId = deps.newId ?? (() => randomUUID());

  function requireLibrary(): { root: string; repos: Repos } {
    const library = deps.getLibrary();
    if (!library) {
      throw new Error("Open a library before using products.");
    }
    return library;
  }

  // Checks the bytes and builds the product JPEG in cache/tmp/<unique>/. The caller renames
  // it into place (or deletes the staging folder) once the database work is settled.
  async function stageImage(
    root: string,
    bytes: Uint8Array,
  ): Promise<
    { ok: true; dir: string; jpg: string } | { ok: false; error: ProductError }
  > {
    const type = detectImageType(bytes);
    if (type === null || type === "heic") {
      return {
        ok: false,
        error: fail("bad-image", "image", BAD_IMAGE_MESSAGE),
      };
    }
    const dir = toAbsolute(root, jobTmpDir(`product-${newId()}`));
    const source = path.join(dir, `source.${SOURCE_EXTENSION[type]}`);
    const jpg = path.join(dir, "image.jpg");
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(source, bytes);
      await deps.processImage(source, jpg);
    } catch {
      await rm(dir, { recursive: true, force: true });
      return {
        ok: false,
        error: fail("bad-image", "image", UNREADABLE_IMAGE_MESSAGE),
      };
    }
    return { ok: true, dir, jpg };
  }

  function slugTaken(repos: Repos, slug: string): ProductError {
    const owner = repos.products.getBySlug(slug);
    const message = slugConflictMessage({
      archived: owner?.archivedAt != null,
    });
    return fail(
      owner?.archivedAt != null ? "slug-taken-archived" : "slug-taken",
      "slug",
      message,
    );
  }

  async function create(
    input: CreateProductInput,
  ): Promise<ProductResult<ProductSummary>> {
    const { root, repos } = requireLibrary();
    const { form, image } = input;
    if (repos.products.getBySlug(form.slug)) {
      return slugTaken(repos, form.slug);
    }

    const id = newId();
    const finalDir = toAbsolute(root, productDir(id));
    let staged: Awaited<ReturnType<typeof stageImage>> | null = null;
    try {
      if (image) {
        staged = await stageImage(root, image);
        if (!staged.ok) {
          return staged.error;
        }
        await mkdir(finalDir, { recursive: true });
        await rename(staged.jpg, toAbsolute(root, productImagePath(id)));
      }
      repos.products.create({
        id,
        fullName: form.fullName,
        shortName: form.shortName,
        slug: form.slug,
        imagePath: image ? productImagePath(id) : null,
      });
    } catch (error) {
      await rm(finalDir, { recursive: true, force: true });
      if (error instanceof SlugTakenError) {
        return slugTaken(repos, form.slug);
      }
      throw error;
    } finally {
      if (staged?.ok) {
        await rm(staged.dir, { recursive: true, force: true });
      }
    }
    return { ok: true, value: summaryOf(repos, id) };
  }

  function summaryOf(repos: Repos, id: string): ProductSummary {
    const summary = repos.products.getSummary(id);
    if (!summary) {
      throw new Error(`Product ${id} disappeared.`);
    }
    return summary;
  }

  // New image first (staged), then the database, and only then the rename over the old
  // image. If the database refuses (taken slug), the old image and row are untouched.
  async function update(
    input: UpdateProductInput,
  ): Promise<ProductResult<ProductSummary>> {
    const { root, repos } = requireLibrary();
    const { id, patch, image, removeImage } = input;
    const current = repos.products.getSummary(id);
    if (!current) {
      return fail("not-found", null, "That product no longer exists.");
    }
    if (
      patch.slug !== undefined &&
      patch.slug !== current.slug &&
      repos.products.getBySlug(patch.slug)
    ) {
      return slugTaken(repos, patch.slug);
    }

    let staged: Awaited<ReturnType<typeof stageImage>> | null = null;
    if (image) {
      staged = await stageImage(root, image);
      if (!staged.ok) {
        return staged.error;
      }
    }

    const finalImage = toAbsolute(root, productImagePath(id));
    let imagePath: string | null | undefined;
    if (image) {
      imagePath = productImagePath(id);
    } else if (removeImage) {
      imagePath = null;
    }

    try {
      try {
        repos.products.update(id, { ...patch, imagePath });
      } catch (error) {
        if (error instanceof SlugTakenError && patch.slug !== undefined) {
          return slugTaken(repos, patch.slug);
        }
        throw error;
      }
      if (staged?.ok) {
        try {
          await mkdir(path.dirname(finalImage), { recursive: true });
          await rename(staged.jpg, finalImage);
        } catch (error) {
          // The row already points at the new image: put the old pointer back.
          repos.products.update(id, { imagePath: current.imagePath });
          throw error;
        }
      }
    } finally {
      if (staged?.ok) {
        await rm(staged.dir, { recursive: true, force: true });
      }
    }
    if (removeImage && !image) {
      await rm(finalImage, { force: true });
    }
    return { ok: true, value: summaryOf(repos, id) };
  }

  // Hard delete (cascades to b-roll rows and captions), then the product folder. A product
  // with videos is refused; the caller offers archive instead.
  async function remove(id: string): Promise<ProductResult<true>> {
    const { root, repos } = requireLibrary();
    if (!repos.products.get(id)) {
      return fail("not-found", null, "That product no longer exists.");
    }
    try {
      repos.products.remove(id);
    } catch (error) {
      if (error instanceof ProductHasVideosError) {
        return fail(
          "has-videos",
          null,
          "This product has exported videos, so it can only be archived.",
          { videoCount: error.videoCount },
        );
      }
      throw error;
    }
    // Rows are gone; a leftover folder is harmless, so a failed rm is not an error.
    await rm(toAbsolute(root, productDir(id)), {
      recursive: true,
      force: true,
    }).catch(() => undefined);
    return { ok: true, value: true };
  }

  return {
    list(): ProductSummary[] {
      return requireLibrary().repos.products.listSummaries();
    },
    create,
    update,
    remove,
    archive(id: string): ProductResult<ProductSummary> {
      const { repos } = requireLibrary();
      if (!repos.products.get(id)) {
        return fail("not-found", null, "That product no longer exists.");
      }
      repos.products.archive(id);
      return { ok: true, value: summaryOf(repos, id) };
    },
    touchLastUsed(id: string): ProductResult<ProductSummary> {
      const { repos } = requireLibrary();
      if (!repos.products.get(id)) {
        return fail("not-found", null, "That product no longer exists.");
      }
      repos.products.touchLastUsed(id);
      return { ok: true, value: summaryOf(repos, id) };
    },
  };
}

export type ProductService = ReturnType<typeof createProductService>;
