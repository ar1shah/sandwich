import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBrollService } from "../src/main/broll/brollService";
import { createJobService } from "../src/main/jobs";
import { importClip } from "../src/main/jobs/importClip";
import { ensureLayout } from "../src/main/library/openLibrary";
import { createJobScheduler } from "../src/shared/jobScheduler";
import {
  ImportBrollInputSchema,
  importedMediaId,
  type JobEvent,
} from "../src/shared/jobs";
import { fakeSteps } from "./helpers/fakeImportSteps";
import { makeTempDir, makeTempLibraryDb } from "./helpers/db";

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(path.relative(dir, entry.parentPath), entry.name))
    .filter((file) => !file.startsWith("library.db"))
    .sort();
}

async function setup() {
  const lib = await makeTempLibraryDb();
  await ensureLayout(lib.root);
  const product = lib.repos.products.create({
    fullName: "Levi's 501",
    slug: "levis-501",
  });
  const originals = makeTempDir("originals-");
  const original = path.join(originals, "BROLL_0001.MOV");
  writeFileSync(original, "original bytes");
  return { ...lib, product, original, originals };
}

function originalFile(dir: string, name: string): string {
  const file = path.join(dir, name);
  writeFileSync(file, "x");
  return file;
}

async function drain(service: { hasActive: () => boolean }) {
  while (service.hasActive()) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("importClip with a b-roll target", () => {
  it("writes into products/<id>/broll/ and inserts a broll row for that product", async () => {
    const t = await setup();
    const result = await importClip(
      t.original,
      {
        jobId: "job-1",
        signal: new AbortController().signal,
        setProgress: () => {},
      },
      {
        target: { kind: "broll", productId: t.product.id },
        root: t.root,
        repos: t.repos,
        steps: fakeSteps(),
        now: () => new Date(2026, 9, 17, 12),
        newId: () => "b1",
      },
    );
    expect(result).toEqual({ mediaId: "b1" });
    expect(listFiles(t.root)).toEqual([
      "cache/filmstrips/b1.jpg",
      `products/${t.product.id}/broll/b1.jpg`,
      `products/${t.product.id}/broll/b1.mp4`,
    ]);
    expect(t.repos.media.get("b1")).toMatchObject({
      kind: "broll",
      productId: t.product.id,
      path: `products/${t.product.id}/broll/b1.mp4`,
      thumbPath: `products/${t.product.id}/broll/b1.jpg`,
      filmstripPath: "cache/filmstrips/b1.jpg",
      originalName: "BROLL_0001.MOV",
    });
    expect(existsSync(path.join(t.root, "cache", "tmp", "job-1"))).toBe(false);
  });

  it("leaves no files and no row when a step fails", async () => {
    const t = await setup();
    await expect(
      importClip(
        t.original,
        {
          jobId: "job-1",
          signal: new AbortController().signal,
          setProgress: () => {},
        },
        {
          target: { kind: "broll", productId: t.product.id },
          root: t.root,
          repos: t.repos,
          steps: fakeSteps({ failAt: "filmstrip" }),
          now: () => new Date(),
          newId: () => "b1",
        },
      ),
    ).rejects.toThrow("filmstrip failed");
    expect(listFiles(t.root)).toEqual([]);
    expect(t.repos.media.list()).toEqual([]);
  });

  it("cleans up the moved files when the row insert fails (product deleted mid-import)", async () => {
    const t = await setup();
    await expect(
      importClip(
        t.original,
        {
          jobId: "job-1",
          signal: new AbortController().signal,
          setProgress: () => {},
        },
        {
          target: { kind: "broll", productId: "no-such-product" },
          root: t.root,
          repos: t.repos,
          steps: fakeSteps(),
          now: () => new Date(),
          newId: () => "b1",
        },
      ),
    ).rejects.toThrow();
    expect(listFiles(t.root)).toEqual([]);
  });
});

describe("job service importBroll", () => {
  function makeService(
    t: Awaited<ReturnType<typeof setup>>,
    events: JobEvent[] = [],
  ) {
    let n = 0;
    return createJobService({
      getLibrary: () => ({ root: t.root, repos: t.repos }),
      onEvent: (event) => events.push(event),
      steps: fakeSteps(),
      now: () => new Date(2026, 9, 17),
      newId: () => `b${++n}`,
    });
  }

  it("imports into the product, and every event carries its productId", async () => {
    const t = await setup();
    const events: JobEvent[] = [];
    const service = makeService(t, events);
    const files = ["a.mov", "b.mov", "c.mov"].map((name) =>
      originalFile(t.originals, name),
    );

    const ids = service.importBroll(t.product.id, files);
    expect(ids).toHaveLength(3);
    expect(service.hasActiveForProduct(t.product.id)).toBe(true);
    expect(service.hasActiveForProduct("someone-else")).toBe(false);
    await drain(service);

    expect(service.hasActiveForProduct(t.product.id)).toBe(false);
    expect(events.every((e) => e.job.productId === t.product.id)).toBe(true);
    const done = events.filter((e) => e.type === "done");
    expect(done).toHaveLength(3);
    expect(done.every((e) => importedMediaId(e.job.result))).toBe(true);
    expect(
      t.repos.media.list({ kind: "broll", productId: t.product.id }),
    ).toHaveLength(3);
  });

  it("rejects a missing product", async () => {
    const t = await setup();
    const service = makeService(t);
    expect(() => service.importBroll("nope", ["/a/b.mov"])).toThrowError(
      expect.objectContaining({ code: "not-found" }),
    );
  });

  it("rejects an archived product", async () => {
    const t = await setup();
    t.repos.products.archive(t.product.id);
    const service = makeService(t);
    expect(() => service.importBroll(t.product.id, ["/a/b.mov"])).toThrowError(
      expect.objectContaining({ code: "archived" }),
    );
    expect(service.hasActive()).toBe(false);
  });

  it("importUgc still imports UGC clips with no productId", async () => {
    const t = await setup();
    const events: JobEvent[] = [];
    const service = makeService(t, events);
    service.importUgc([t.original]);
    await drain(service);
    expect(events.every((e) => e.job.productId === undefined)).toBe(true);
    expect(t.repos.media.list({ kind: "ugc" })).toHaveLength(1);
    expect(t.repos.media.list({ kind: "broll" })).toHaveLength(0);
    expect(service.hasActiveForProduct(t.product.id)).toBe(false);
  });

  it("still counts a cancelling import as active for the product", async () => {
    const t = await setup();
    const service = createJobService({
      getLibrary: () => ({ root: t.root, repos: t.repos }),
      onEvent: () => undefined,
      steps: fakeSteps({ abortAt: "normalize" }),
    });
    service.importBroll(t.product.id, [t.original]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const cancelled = service.cancelAll();
    expect(service.hasActiveForProduct(t.product.id)).toBe(true);
    await cancelled;
    expect(service.hasActiveForProduct(t.product.id)).toBe(false);
    expect(listFiles(t.root)).toEqual([]);
  });
});

describe("scheduler hasActiveForProduct", () => {
  it("is true from enqueue until the runner settles", async () => {
    let release: () => void = () => {};
    const scheduler = createJobScheduler({ enabledTypes: ["importClip"] });
    scheduler.enqueue({
      type: "importClip",
      label: "x",
      productId: "p1",
      run: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    expect(scheduler.hasActiveForProduct("p1")).toBe(true);
    expect(scheduler.hasActiveForProduct("p2")).toBe(false);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scheduler.hasActiveForProduct("p1")).toBe(false);
    // The finished job keeps its productId in the snapshot (history).
    expect(scheduler.snapshot()[0]?.productId).toBe("p1");
  });
});

describe("brollService", () => {
  async function withBroll() {
    const t = await setup();
    const service = createBrollService({
      getLibrary: () => ({ root: t.root, repos: t.repos }),
      jobs: { importBroll: () => [] },
    });
    const paths = (id: string) => ({
      path: `products/${t.product.id}/broll/${id}.mp4`,
      thumbPath: `products/${t.product.id}/broll/${id}.jpg`,
      filmstripPath: `cache/filmstrips/${id}.jpg`,
    });
    const make = (id: string) => {
      const p = paths(id);
      for (const rel of [p.path, p.thumbPath, p.filmstripPath]) {
        const file = path.join(t.root, ...rel.split("/"));
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, "x");
      }
      return t.repos.media.create({
        id,
        kind: "broll",
        productId: t.product.id,
        ...p,
        duration: 5,
        width: 1080,
        height: 1920,
      });
    };
    return { ...t, service, make };
  }

  it("lists only this product's b-roll", async () => {
    const t = await withBroll();
    t.make("b1");
    t.make("b2");
    t.repos.media.create({
      kind: "ugc",
      path: "clips/2026-10/u1.mp4",
      duration: 5,
      width: 1080,
      height: 1920,
    });
    const other = t.repos.products.create({ fullName: "Other", slug: "other" });
    t.repos.media.create({
      kind: "broll",
      productId: other.id,
      path: `products/${other.id}/broll/o1.mp4`,
      duration: 5,
      width: 1080,
      height: 1920,
    });
    expect(
      t.service
        .list(t.product.id)
        .map((m) => m.id)
        .sort(),
    ).toEqual(["b1", "b2"]);
  });

  it("remove deletes the row and the video, thumbnail and filmstrip, and only those", async () => {
    const t = await withBroll();
    t.make("b1");
    t.make("b2");
    expect(await t.service.remove("b1")).toEqual({ ok: true, value: true });
    expect(t.repos.media.get("b1")).toBeNull();
    expect(listFiles(t.root)).toEqual([
      "cache/filmstrips/b2.jpg",
      `products/${t.product.id}/broll/b2.jpg`,
      `products/${t.product.id}/broll/b2.mp4`,
    ]);
  });

  it("remove tolerates files that are already gone", async () => {
    const t = await withBroll();
    t.make("b1");
    await import("node:fs/promises").then((fs) =>
      fs.rm(path.join(t.root, "cache", "filmstrips", "b1.jpg")),
    );
    expect((await t.service.remove("b1")).ok).toBe(true);
    expect(t.repos.media.get("b1")).toBeNull();
  });

  it("remove refuses unknown ids and non-broll media", async () => {
    const t = await withBroll();
    const ugc = t.repos.media.create({
      kind: "ugc",
      path: "clips/2026-10/u1.mp4",
      duration: 5,
      width: 1080,
      height: 1920,
    });
    expect(await t.service.remove("nope")).toMatchObject({
      ok: false,
      code: "not-found",
    });
    expect(await t.service.remove(ugc.id)).toMatchObject({
      ok: false,
      code: "not-found",
    });
    expect(t.repos.media.get(ugc.id)).not.toBeNull();
  });

  it("importFiles turns a rejected import into a result", async () => {
    const t = await setup();
    const service = createBrollService({
      getLibrary: () => ({ root: t.root, repos: t.repos }),
      jobs: createJobService({
        getLibrary: () => ({ root: t.root, repos: t.repos }),
        onEvent: () => undefined,
        steps: fakeSteps(),
      }),
    });
    expect(service.importFiles("nope", ["/a/b.mov"])).toMatchObject({
      ok: false,
      code: "not-found",
    });
    t.repos.products.archive(t.product.id);
    expect(service.importFiles(t.product.id, ["/a/b.mov"])).toMatchObject({
      ok: false,
      code: "archived",
    });
  });
});

describe("ImportBrollInputSchema", () => {
  it("needs a product id and absolute video paths", () => {
    expect(
      ImportBrollInputSchema.parse({
        productId: "p1",
        filePaths: ["/a/b.MOV"],
      }),
    ).toEqual({ productId: "p1", filePaths: ["/a/b.MOV"] });
    expect(() =>
      ImportBrollInputSchema.parse({ productId: "", filePaths: ["/a/b.mov"] }),
    ).toThrow();
    expect(() =>
      ImportBrollInputSchema.parse({ productId: "p1", filePaths: [] }),
    ).toThrow();
    expect(() =>
      ImportBrollInputSchema.parse({ productId: "p1", filePaths: ["b.mov"] }),
    ).toThrow();
    expect(() =>
      ImportBrollInputSchema.parse({
        productId: "p1",
        filePaths: ["/a/b.avi"],
      }),
    ).toThrow();
  });
});
