import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NotFoundError,
  ProductHasVideosError,
  SlugTakenError,
} from "../src/main/db/errors";
import { toAbsolute } from "../src/main/db/libraryPaths";
import { makeTempLibraryDb } from "./helpers/db";

const product = (
  slug = "levis-501",
  fullName = "Levi's 501 Original Fit Jeans",
) => ({
  fullName,
  shortName: "the 501s",
  slug,
});

const media = (productId: string | null, path = "products/x/broll/b.mp4") => ({
  kind: productId ? ("broll" as const) : ("ugc" as const),
  productId,
  path,
  duration: 5.5,
  width: 1080,
  height: 1920,
});

describe("products", () => {
  it("creates, gets and updates", async () => {
    const { repos } = await makeTempLibraryDb();
    const created = repos.products.create({
      ...product(),
      imagePath: "products/id-1/image.jpg",
    });
    expect(created).toMatchObject({
      id: "id-1",
      fullName: "Levi's 501 Original Fit Jeans",
      shortName: "the 501s",
      slug: "levis-501",
      imagePath: "products/id-1/image.jpg",
      lastUsedAt: null,
      archivedAt: null,
    });
    expect(repos.products.get("id-1")).toEqual(created);
    expect(repos.products.getBySlug("levis-501")?.id).toBe("id-1");

    const updated = repos.products.update("id-1", {
      shortName: null,
      fullName: "Levi's 501",
    });
    expect(updated).toMatchObject({
      shortName: null,
      fullName: "Levi's 501",
      slug: "levis-501",
    });
    expect(updated.updatedAt > created.updatedAt).toBe(true);
    expect(() => repos.products.update("nope", {})).toThrow(NotFoundError);
  });

  it("enforces unique slugs with a typed error", async () => {
    const { repos } = await makeTempLibraryDb();
    repos.products.create(product("a"));
    expect(() => repos.products.create(product("a", "Other"))).toThrow(
      SlugTakenError,
    );
    const other = repos.products.create(product("b", "Other"));
    expect(() => repos.products.update(other.id, { slug: "a" })).toThrow(
      SlugTakenError,
    );
  });

  it("searches name, short name and slug, treating % and _ literally", async () => {
    const { repos } = await makeTempLibraryDb();
    repos.products.create({ fullName: "Aloe Gel", slug: "aloe-gel" });
    repos.products.create({
      fullName: "100% Pure Oil",
      shortName: "the oil",
      slug: "pure-oil",
    });
    expect(repos.products.list({ search: "aloe" }).map((p) => p.slug)).toEqual([
      "aloe-gel",
    ]);
    expect(
      repos.products.list({ search: "THE OIL" }).map((p) => p.slug),
    ).toEqual(["pure-oil"]);
    expect(repos.products.list({ search: "pure-" }).map((p) => p.slug)).toEqual(
      ["pure-oil"],
    );
    expect(repos.products.list({ search: "%" }).map((p) => p.slug)).toEqual([
      "pure-oil",
    ]);
    expect(repos.products.list({ search: "_" })).toEqual([]);
  });

  it("lists recently used first, then by name", async () => {
    const { repos } = await makeTempLibraryDb();
    const b = repos.products.create({ fullName: "B", slug: "b" });
    repos.products.create({ fullName: "A", slug: "a" });
    expect(repos.products.list().map((p) => p.slug)).toEqual(["a", "b"]);
    repos.products.touchLastUsed(b.id);
    expect(repos.products.list().map((p) => p.slug)).toEqual(["b", "a"]);
  });

  it("archives and unarchives: hidden from lists, still readable, videos kept", async () => {
    const { repos } = await makeTempLibraryDb();
    const p = repos.products.create(product());
    repos.videos.create({ productId: p.id, recipeJson: "{}" });

    const archived = repos.products.archive(p.id);
    expect(archived.archivedAt).not.toBeNull();
    expect(repos.products.list()).toEqual([]);
    expect(repos.products.list({ includeArchived: true })).toHaveLength(1);
    expect(repos.products.get(p.id)?.archivedAt).not.toBeNull();
    expect(repos.videos.list({ productId: p.id })).toHaveLength(1);

    expect(repos.products.unarchive(p.id).archivedAt).toBeNull();
    expect(repos.products.list()).toHaveLength(1);
  });

  it("hard delete works with zero videos and is refused otherwise", async () => {
    const { repos } = await makeTempLibraryDb();
    const withVideo = repos.products.create(product("a"));
    repos.videos.create({ productId: withVideo.id, recipeJson: "{}" });
    expect(() => repos.products.remove(withVideo.id)).toThrow(
      ProductHasVideosError,
    );
    expect(repos.products.get(withVideo.id)).not.toBeNull();

    const empty = repos.products.create(product("b", "B"));
    expect(repos.products.remove(empty.id)).toBe(true);
    expect(repos.products.remove(empty.id)).toBe(false);
  });

  it("deleting a product cascades to its media and captions, not to others", async () => {
    const { repos } = await makeTempLibraryDb();
    const a = repos.products.create(product("a", "A"));
    const b = repos.products.create(product("b", "B"));
    repos.media.create(media(a.id, "products/a/broll/1.mp4"));
    repos.media.create(media(b.id, "products/b/broll/1.mp4"));
    repos.media.create(media(null, "clips/2026-10/u.mp4"));
    repos.captions.create({ text: "for a", slot: "any", productId: a.id });
    repos.captions.create({ text: "for b", slot: "any", productId: b.id });
    repos.captions.create({ text: "generic", slot: "any" });

    repos.products.remove(a.id);
    expect(
      repos.media
        .list()
        .map((m) => m.path)
        .sort(),
    ).toEqual(["clips/2026-10/u.mp4", "products/b/broll/1.mp4"]);
    expect(repos.captions.list().map((c) => c.text)).toEqual([
      "for b",
      "generic",
    ]);
  });
});

describe("media", () => {
  it("round trips fields and booleans, and filters", async () => {
    const { repos } = await makeTempLibraryDb();
    const p = repos.products.create(product());
    const clip = repos.media.create({
      ...media(p.id),
      thumbPath: "products/x/broll/b.jpg",
      filmstripPath: "cache/filmstrips/m.jpg",
      originalName: "IMG_0001.MOV",
      recordedAt: "2026-10-01T12:00:00Z",
      wasHdr: true,
    });
    expect(clip).toMatchObject({
      wasHdr: true,
      duration: 5.5,
      originalName: "IMG_0001.MOV",
    });
    repos.media.create(media(null, "clips/2026-10/u.mp4"));
    expect(repos.media.list({ kind: "broll", productId: p.id })).toHaveLength(
      1,
    );
    expect(repos.media.list({ kind: "ugc" })).toHaveLength(1);
    expect(repos.media.get(clip.id)?.wasHdr).toBe(true);
    expect(repos.media.remove(clip.id)).toBe(true);
  });

  it("stores relative paths and converts to absolute with path.join", async () => {
    const { repos, root } = await makeTempLibraryDb();
    const rel = "products/p1/broll/b1.mp4";
    const saved = repos.media.create(media(null, rel));
    expect(repos.media.get(saved.id)?.path).toBe(rel);
    expect(toAbsolute(root, saved.path)).toBe(
      path.join(root, "products", "p1", "broll", "b1.mp4"),
    );
  });

  it("uses a caller-supplied id, and rejects a duplicate one", async () => {
    const { repos } = await makeTempLibraryDb();
    const saved = repos.media.create({
      ...media(null, "clips/2026-10/mine.mp4"),
      id: "mine",
    });
    expect(saved.id).toBe("mine");
    expect(repos.media.get("mine")?.path).toBe("clips/2026-10/mine.mp4");
    expect(() =>
      repos.media.create({ ...media(null, "clips/2026-10/b.mp4"), id: "mine" }),
    ).toThrow(/UNIQUE|PRIMARY/);
    // Without an id the repo still generates one.
    expect(repos.media.create(media(null, "clips/2026-10/c.mp4")).id).toMatch(
      /^id-/,
    );
  });

  it("rejects absolute, traversing and backslash paths", async () => {
    const { repos } = await makeTempLibraryDb();
    for (const bad of ["/abs/x.mp4", "../x.mp4", "a\\b.mp4", "C:/x.mp4"]) {
      expect(() => repos.media.create(media(null, bad))).toThrow(
        /Library media path/,
      );
    }
    expect(() =>
      repos.media.create({ ...media(null), thumbPath: "/abs/t.jpg" }),
    ).toThrow(/thumbnail path/);
  });

  it("enforces the kind check and the product foreign key", async () => {
    const { repos } = await makeTempLibraryDb();
    expect(() =>
      repos.media.create({ ...media(null), kind: "bogus" as never }),
    ).toThrow(/CHECK/);
    expect(() => repos.media.create(media("missing-product"))).toThrow(
      /FOREIGN KEY/,
    );
  });
});

describe("captions createMany", () => {
  it("inserts all rows with one timestamp in the given order", async () => {
    const { repos } = await makeTempLibraryDb();
    const rows = repos.captions.createMany([
      { text: "one", slot: "before" },
      { text: "two", slot: "after" },
      { text: "three", slot: "any" },
    ]);
    expect(rows.map((r) => r.text)).toEqual(["one", "two", "three"]);
    expect(new Set(rows.map((r) => r.createdAt)).size).toBe(1);
    expect(repos.captions.list().map((r) => r.text)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("is all or nothing: a bad row rolls the whole batch back", async () => {
    const { repos } = await makeTempLibraryDb();
    expect(() =>
      repos.captions.createMany([
        { text: "ok", slot: "any" },
        { text: "bad product", slot: "any", productId: "missing" },
      ]),
    ).toThrow();
    expect(repos.captions.list()).toEqual([]);
  });
});

describe("captions", () => {
  it("creates, filters by slot and product, updates, counts uses, removes", async () => {
    const { repos } = await makeTempLibraryDb();
    const p = repos.products.create(product());
    const generic = repos.captions.create({
      text: "10/10 {product}",
      slot: "any",
    });
    const specific = repos.captions.create({
      text: "4 weeks later",
      slot: "after",
      productId: p.id,
    });
    expect(generic.productId).toBeNull();

    expect(repos.captions.list({ slot: "after" }).map((c) => c.id)).toEqual([
      specific.id,
    ]);
    expect(repos.captions.list({ productId: null }).map((c) => c.id)).toEqual([
      generic.id,
    ]);
    expect(repos.captions.list({ productId: p.id }).map((c) => c.id)).toEqual([
      specific.id,
    ]);
    expect(repos.captions.list()).toHaveLength(2);

    const edited = repos.captions.update(specific.id, {
      text: "5 weeks later",
      productId: null,
    });
    expect(edited).toMatchObject({
      text: "5 weeks later",
      productId: null,
      slot: "after",
    });
    expect(repos.captions.incrementUseCount(generic.id).useCount).toBe(1);
    expect(repos.captions.remove(generic.id)).toBe(true);
    expect(() => repos.captions.update("nope", {})).toThrow(NotFoundError);
  });

  it("enforces the slot check", async () => {
    const { repos } = await makeTempLibraryDb();
    expect(() =>
      repos.captions.create({ text: "x", slot: "middle" as never }),
    ).toThrow(/CHECK/);
  });
});

describe("videos", () => {
  it("creates drafts, lists by product and status, updates and removes", async () => {
    const { repos } = await makeTempLibraryDb();
    const a = repos.products.create(product("a", "A"));
    const b = repos.products.create(product("b", "B"));
    const draft = repos.videos.create({
      productId: a.id,
      recipeJson: '{"v":1}',
    });
    expect(draft).toMatchObject({
      status: "draft",
      exportPath: null,
      batchId: null,
    });
    repos.videos.create({ productId: b.id, recipeJson: "{}" });

    expect(repos.videos.list({ productId: a.id })).toHaveLength(1);
    const exported = repos.videos.update(draft.id, {
      status: "exported",
      exportPath: "exports/a/2026-10-17/a.mp4",
    });
    expect(exported).toMatchObject({
      status: "exported",
      recipeJson: '{"v":1}',
    });
    expect(repos.videos.list({ status: "exported" })).toHaveLength(1);
    expect(repos.videos.remove(draft.id)).toBe(true);
  });

  it("enforces the status check, the product foreign key and relative export paths", async () => {
    const { repos } = await makeTempLibraryDb();
    const p = repos.products.create(product());
    expect(() =>
      repos.videos.create({
        productId: p.id,
        recipeJson: "{}",
        status: "weird" as never,
      }),
    ).toThrow(/CHECK/);
    expect(() =>
      repos.videos.create({ productId: "missing", recipeJson: "{}" }),
    ).toThrow(/FOREIGN KEY/);
    expect(() =>
      repos.videos.create({
        productId: p.id,
        recipeJson: "{}",
        exportPath: "/abs/x.mp4",
      }),
    ).toThrow(/export path/);
  });
});
