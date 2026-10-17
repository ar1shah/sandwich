import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProductService } from "../src/main/products/productService";
import {
  BAD_IMAGE_MESSAGE,
  PRODUCT_BUSY_MESSAGE,
} from "../src/shared/products";
import { makeTempLibraryDb } from "./helpers/db";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = Uint8Array.from(new TextEncoder().encode("GIF89a...."));
const HEIC = new Uint8Array([
  0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);

async function setup(options: { failImage?: boolean } = {}) {
  const lib = await makeTempLibraryDb();
  let processed = 0;
  let counter = 0;
  const calls: string[] = [];
  // Products that currently have a queued/running import job.
  const busyProducts = new Set<string>();
  const service = createProductService({
    getLibrary: () => ({ root: lib.root, repos: lib.repos }),
    hasActiveJobForProduct: (id) => busyProducts.has(id),
    newId: () => `p${++counter}`,
    // Stands in for ffmpeg: writes a recognisable "processed" file.
    processImage: async (input, output) => {
      calls.push(input);
      if (options.failImage) {
        throw new Error("ffmpeg could not decode");
      }
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, `processed-${++processed}`);
    },
  });
  const abs = (...parts: string[]) => path.join(lib.root, ...parts);
  const form = (
    name: string,
    slug: string,
    shortName: string | null = null,
  ) => ({
    fullName: name,
    shortName,
    slug,
  });
  const tmpEntries = () =>
    existsSync(abs("cache", "tmp")) ? readdirSync(abs("cache", "tmp")) : [];
  return { ...lib, service, abs, form, calls, tmpEntries, busyProducts };
}

async function created(ctx: Awaited<ReturnType<typeof setup>>, image = PNG) {
  const result = await ctx.service.create({
    form: ctx.form("Levi's 501", "levis-501", "the 501s"),
    image,
  });
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.value;
}

describe("create", () => {
  it("writes products/<id>/image.jpg, stores a relative path and leaves no staging", async () => {
    const ctx = await setup();
    const product = await created(ctx);

    expect(product).toMatchObject({
      fullName: "Levi's 501",
      shortName: "the 501s",
      slug: "levis-501",
      imagePath: `products/${product.id}/image.jpg`,
      brollCount: 0,
      captionCount: 0,
      videoCount: 0,
    });
    expect(
      readFileSync(ctx.abs("products", product.id, "image.jpg"), "utf8"),
    ).toBe("processed-1");
    expect(ctx.tmpEntries()).toEqual([]);
  });

  it("creates a product without an image", async () => {
    const ctx = await setup();
    const result = await ctx.service.create({
      form: ctx.form("Plain", "plain"),
    });
    expect(result).toMatchObject({ ok: true, value: { imagePath: null } });
    expect(ctx.calls).toEqual([]);
  });

  it("accepts JPEG and PNG bytes and hands ffmpeg a matching file", async () => {
    const ctx = await setup();
    await ctx.service.create({ form: ctx.form("A", "a"), image: JPEG });
    await ctx.service.create({ form: ctx.form("B", "b"), image: PNG });
    expect(ctx.calls.map((file) => path.extname(file))).toEqual([
      ".jpg",
      ".png",
    ]);
  });

  it("rejects unknown and HEIC bytes without calling ffmpeg", async () => {
    const ctx = await setup();
    for (const image of [GIF, HEIC]) {
      const result = await ctx.service.create({
        form: ctx.form("X", "x"),
        image,
      });
      expect(result).toMatchObject({
        ok: false,
        code: "bad-image",
        field: "image",
        message: BAD_IMAGE_MESSAGE,
      });
    }
    expect(ctx.calls).toEqual([]);
    expect(ctx.repos.products.list()).toEqual([]);
  });

  it("leaves no folder, row or staging when ffmpeg cannot read the image", async () => {
    const ctx = await setup({ failImage: true });
    const result = await ctx.service.create({
      form: ctx.form("X", "x"),
      image: PNG,
    });
    expect(result).toMatchObject({ ok: false, code: "bad-image" });
    expect(ctx.repos.products.list()).toEqual([]);
    expect(existsSync(ctx.abs("products"))).toBe(false);
    expect(ctx.tmpEntries()).toEqual([]);
  });

  it("returns a slug error for a duplicate and creates no files", async () => {
    const ctx = await setup();
    await created(ctx);
    const before = readdirSync(ctx.abs("products"));

    const result = await ctx.service.create({
      form: ctx.form("Another", "levis-501"),
      image: PNG,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "slug-taken",
      field: "slug",
    });
    expect(readdirSync(ctx.abs("products"))).toEqual(before);
    expect(ctx.tmpEntries()).toEqual([]);
    expect(ctx.repos.products.list({ includeArchived: true })).toHaveLength(1);
  });

  it("says so when the slug belongs to an archived product", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    ctx.service.archive(product.id);

    const result = await ctx.service.create({
      form: ctx.form("Again", "levis-501"),
    });
    expect(result).toMatchObject({ ok: false, code: "slug-taken-archived" });
    expect(!result.ok && result.message).toMatch(/archived product/);
  });
});

describe("update", () => {
  it("does not change the slug when only the full name changes", async () => {
    const ctx = await setup();
    const product = await created(ctx);

    const result = await ctx.service.update({
      id: product.id,
      patch: { fullName: "Levi's 501 Original Fit Jeans" },
    });
    expect(result).toMatchObject({
      ok: true,
      value: { fullName: "Levi's 501 Original Fit Jeans", slug: "levis-501" },
    });
  });

  it("keeps the short name when the patch leaves it out, clears it with null", async () => {
    const ctx = await setup();
    const product = await created(ctx);

    const kept = await ctx.service.update({ id: product.id, patch: {} });
    expect(kept).toMatchObject({ ok: true, value: { shortName: "the 501s" } });

    const cleared = await ctx.service.update({
      id: product.id,
      patch: { shortName: null },
    });
    expect(cleared).toMatchObject({ ok: true, value: { shortName: null } });
  });

  it("changes the slug when asked to", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    const result = await ctx.service.update({
      id: product.id,
      patch: { slug: "the-501s" },
    });
    expect(result).toMatchObject({ ok: true, value: { slug: "the-501s" } });
  });

  it("replaces the image and bumps updated_at", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    const file = ctx.abs("products", product.id, "image.jpg");

    const result = await ctx.service.update({
      id: product.id,
      patch: {},
      image: JPEG,
    });
    expect(result.ok).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("processed-2");
    expect(result.ok && result.value.updatedAt > product.updatedAt).toBe(true);
    expect(ctx.tmpEntries()).toEqual([]);
  });

  it("adds an image to a product that had none", async () => {
    const ctx = await setup();
    const result = await ctx.service.create({
      form: ctx.form("Plain", "plain"),
    });
    if (!result.ok) {
      throw new Error("create failed");
    }
    const updated = await ctx.service.update({
      id: result.value.id,
      patch: {},
      image: PNG,
    });
    expect(updated).toMatchObject({
      ok: true,
      value: { imagePath: `products/${result.value.id}/image.jpg` },
    });
    expect(existsSync(ctx.abs("products", result.value.id, "image.jpg"))).toBe(
      true,
    );
  });

  it("leaves the original image bytes and row alone when the new slug is taken", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    const other = await ctx.service.create({
      form: ctx.form("Other", "other"),
    });
    expect(other.ok).toBe(true);
    const file = ctx.abs("products", product.id, "image.jpg");
    const bytesBefore = readFileSync(file);
    const rowBefore = ctx.repos.products.get(product.id);

    const result = await ctx.service.update({
      id: product.id,
      patch: { fullName: "Renamed", slug: "other" },
      image: JPEG,
    });

    expect(result).toMatchObject({ ok: false, code: "slug-taken" });
    expect(readFileSync(file).equals(bytesBefore)).toBe(true);
    expect(ctx.repos.products.get(product.id)).toEqual(rowBefore);
    expect(ctx.tmpEntries()).toEqual([]);
  });

  it("removes the image on request", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    const result = await ctx.service.update({
      id: product.id,
      patch: {},
      removeImage: true,
    });
    expect(result).toMatchObject({ ok: true, value: { imagePath: null } });
    expect(existsSync(ctx.abs("products", product.id, "image.jpg"))).toBe(
      false,
    );
  });

  it("keeps the old image when the new one cannot be read", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    const result = await ctx.service.update({
      id: product.id,
      patch: { fullName: "Renamed" },
      image: GIF,
    });
    expect(result).toMatchObject({ ok: false, code: "bad-image" });
    expect(ctx.repos.products.get(product.id)?.fullName).toBe("Levi's 501");
    expect(
      readFileSync(ctx.abs("products", product.id, "image.jpg"), "utf8"),
    ).toBe("processed-1");
  });

  it("reports an unknown product", async () => {
    const ctx = await setup();
    expect(await ctx.service.update({ id: "nope", patch: {} })).toMatchObject({
      ok: false,
      code: "not-found",
    });
  });
});

describe("remove", () => {
  it("deletes the row, its b-roll and captions, and the folder", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    ctx.repos.media.create({
      kind: "broll",
      productId: product.id,
      path: `products/${product.id}/broll/b1.mp4`,
      duration: 5,
      width: 1080,
      height: 1920,
    });
    ctx.repos.captions.create({
      text: "10/10 {product}",
      slot: "any",
      productId: product.id,
    });
    await mkdir(ctx.abs("products", product.id, "broll"), { recursive: true });
    await writeFile(ctx.abs("products", product.id, "broll", "b1.mp4"), "x");

    const [listed] = ctx.service.list();
    expect(listed).toMatchObject({ brollCount: 1, captionCount: 1 });

    expect(await ctx.service.remove(product.id)).toEqual({
      ok: true,
      value: true,
    });
    expect(ctx.service.list()).toEqual([]);
    expect(ctx.repos.media.list()).toEqual([]);
    expect(ctx.repos.captions.list()).toEqual([]);
    expect(existsSync(ctx.abs("products", product.id))).toBe(false);
  });

  it("removes the b-roll filmstrips under cache/, which live outside the product folder", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    const other = await ctx.service.create({
      form: ctx.form("Other", "other"),
    });
    if (!other.ok) {
      throw new Error(other.message);
    }
    for (const [owner, id] of [
      [product.id, "mine"],
      [other.value.id, "theirs"],
    ] as const) {
      ctx.repos.media.create({
        kind: "broll",
        productId: owner,
        path: `products/${owner}/broll/${id}.mp4`,
        filmstripPath: `cache/filmstrips/${id}.jpg`,
        duration: 5,
        width: 1080,
        height: 1920,
      });
      await mkdir(ctx.abs("cache", "filmstrips"), { recursive: true });
      await writeFile(ctx.abs("cache", "filmstrips", `${id}.jpg`), "x");
    }

    expect((await ctx.service.remove(product.id)).ok).toBe(true);
    expect(existsSync(ctx.abs("cache", "filmstrips", "mine.jpg"))).toBe(false);
    expect(existsSync(ctx.abs("cache", "filmstrips", "theirs.jpg"))).toBe(true);
  });

  it("refuses while an import job is active for that product, but not for another product's", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    ctx.busyProducts.add("some-other-product");
    expect((await ctx.service.remove(product.id)).ok).toBe(true);

    const again = await ctx.service.create({
      form: ctx.form("Again", "again"),
    });
    if (!again.ok) {
      throw new Error(again.message);
    }
    ctx.busyProducts.add(again.value.id);
    const refused = await ctx.service.remove(again.value.id);
    expect(refused).toMatchObject({
      ok: false,
      code: "busy",
      message: PRODUCT_BUSY_MESSAGE,
    });
    // Nothing was touched.
    expect(ctx.service.list()).toHaveLength(1);

    // The job finished: delete works again.
    ctx.busyProducts.delete(again.value.id);
    expect((await ctx.service.remove(again.value.id)).ok).toBe(true);
    expect(ctx.service.list()).toEqual([]);
  });

  it("refuses a product with videos and keeps its files", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    ctx.repos.videos.create({ productId: product.id, recipeJson: "{}" });

    const result = await ctx.service.remove(product.id);
    expect(result).toMatchObject({
      ok: false,
      code: "has-videos",
      videoCount: 1,
    });
    expect(ctx.service.list()[0]).toMatchObject({ videoCount: 1 });
    expect(existsSync(ctx.abs("products", product.id, "image.jpg"))).toBe(true);
  });

  it("reports an unknown product", async () => {
    const ctx = await setup();
    expect(await ctx.service.remove("nope")).toMatchObject({
      ok: false,
      code: "not-found",
    });
  });
});

describe("list, archive and touchLastUsed", () => {
  it("lists archived products too, flagged by archivedAt", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    ctx.service.archive(product.id);
    const [listed] = ctx.service.list();
    expect(listed?.archivedAt).not.toBeNull();
  });

  it("touchLastUsed sets lastUsedAt", async () => {
    const ctx = await setup();
    const product = await created(ctx);
    expect(product.lastUsedAt).toBeNull();
    const result = ctx.service.touchLastUsed(product.id);
    expect(result.ok && result.value.lastUsedAt).not.toBeNull();
  });

  it("throws when no library is open", () => {
    const service = createProductService({
      getLibrary: () => null,
      hasActiveJobForProduct: () => false,
      processImage: async () => undefined,
    });
    expect(() => service.list()).toThrow(/Open a library/);
  });
});
