import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importClip, type ImportSteps } from "../src/main/jobs/importClip";
import { createJobService } from "../src/main/jobs";
import { sweepLibrary } from "../src/main/library/sweepLibrary";
import { ensureLayout } from "../src/main/library/openLibrary";
import { importedMediaId, type JobEvent } from "../src/shared/jobs";
import { fakeSteps } from "./helpers/fakeImportSteps";
import { makeTempDir, makeTempLibraryDb } from "./helpers/db";

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(path.relative(dir, entry.parentPath), entry.name))
    .sort();
}

async function setup(stepOptions: Parameters<typeof fakeSteps>[0] = {}) {
  const lib = await makeTempLibraryDb();
  await ensureLayout(lib.root);
  const originalDir = makeTempDir("originals-");
  const original = path.join(originalDir, "IMG_0001.MOV");
  writeFileSync(original, "original bytes");
  const progress: Array<[number, string | undefined]> = [];
  const controller = new AbortController();
  const run = () =>
    importClip(
      original,
      {
        jobId: "job-1",
        signal: controller.signal,
        setProgress: (percent, stage) => progress.push([percent, stage]),
      },
      {
        root: lib.root,
        repos: lib.repos,
        steps: fakeSteps(stepOptions),
        // Local date, so the month folder is the same in any time zone.
        now: () => new Date(2026, 9, 17, 12),
        newId: () => "clip-1",
      },
    );
  return { ...lib, original, controller, progress, run };
}

describe("importClip", () => {
  it("moves all three files into place, inserts one row last, and leaves the original alone", async () => {
    const t = await setup();
    const result = await t.run();
    expect(result).toEqual({ mediaId: "clip-1" });

    expect(
      listFiles(t.root).filter((f) => !f.startsWith("library.db")),
    ).toEqual([
      "cache/filmstrips/clip-1.jpg",
      "clips/2026-10/clip-1.jpg",
      "clips/2026-10/clip-1.mp4",
    ]);
    expect(existsSync(path.join(t.root, "cache", "tmp", "job-1"))).toBe(false);

    const rows = t.repos.media.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "clip-1",
      kind: "ugc",
      productId: null,
      path: "clips/2026-10/clip-1.mp4",
      thumbPath: "clips/2026-10/clip-1.jpg",
      filmstripPath: "cache/filmstrips/clip-1.jpg",
      originalName: "IMG_0001.MOV",
      duration: 4.5,
      width: 1080,
      height: 1920,
      recordedAt: "2026-10-01T10:00:00Z",
      wasHdr: true,
    });
    // Original untouched.
    expect(readFileSync(t.original, "utf8")).toBe("original bytes");
  });

  it("reports stage-weighted progress that only goes up and ends at the filmstrip stage", async () => {
    const t = await setup();
    await t.run();
    const percents = t.progress.map(([p]) => p);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(t.progress.map(([, stage]) => stage)).toContain("Thumbnail");
    expect(t.progress.at(-1)).toEqual([95, "Filmstrip"]);
  });

  for (const stage of ["normalize", "thumbnail", "filmstrip"] as const) {
    it(`a failure in ${stage} leaves no files and no row`, async () => {
      const t = await setup({ failAt: stage });
      await expect(t.run()).rejects.toThrow(`${stage} failed`);
      expect(
        listFiles(t.root).filter((f) => !f.startsWith("library.db")),
      ).toEqual([]);
      expect(t.repos.media.list()).toEqual([]);
      expect(readFileSync(t.original, "utf8")).toBe("original bytes");
    });

    it(`an abort during ${stage} leaves no files and no row`, async () => {
      const t = await setup({
        abortAt: stage,
        onStep: (name) => {
          if (name === stage) {
            queueMicrotask(() => t.controller.abort());
          }
        },
      });
      await expect(t.run()).rejects.toMatchObject({ name: "AbortError" });
      expect(
        listFiles(t.root).filter((f) => !f.startsWith("library.db")),
      ).toEqual([]);
      expect(t.repos.media.list()).toEqual([]);
    });
  }

  it("an abort after the last step but before the renames still cleans up", async () => {
    const t = await setup({
      onStep: (name) => {
        if (name === "filmstrip") {
          // Aborts as the last step starts; the step itself succeeds.
          t.controller.abort();
        }
      },
    });
    await expect(t.run()).rejects.toMatchObject({ name: "AbortError" });
    expect(
      listFiles(t.root).filter((f) => !f.startsWith("library.db")),
    ).toEqual([]);
    expect(t.repos.media.list()).toEqual([]);
  });

  it("removes files already moved when the insert fails", async () => {
    const t = await setup();
    // Same id already taken -> the insert throws after the renames.
    t.repos.media.create({
      id: "clip-1",
      kind: "ugc",
      path: "clips/2026-09/other.mp4",
      duration: 1,
      width: 1,
      height: 1,
    });
    await expect(t.run()).rejects.toThrow(/UNIQUE|PRIMARY/);
    expect(
      listFiles(t.root).filter((f) => !f.startsWith("library.db")),
    ).toEqual([]);
    expect(t.repos.media.list()).toHaveLength(1);
  });
});

describe("job service", () => {
  it("imports through the queue, 2 at a time, and done carries the media id", async () => {
    const lib = await makeTempLibraryDb();
    await ensureLayout(lib.root);
    const originals = makeTempDir("originals-");
    const files = Array.from({ length: 5 }, (_, i) => {
      const file = path.join(originals, `clip${i}.mov`);
      writeFileSync(file, "x");
      return file;
    });

    let active = 0;
    let peak = 0;
    const base = fakeSteps();
    const steps: ImportSteps = {
      ...base,
      normalize: async (input, output, options) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        try {
          return await base.normalize(input, output, options);
        } finally {
          active--;
        }
      },
    };
    const events: JobEvent[] = [];
    let n = 0;
    const service = createJobService({
      getLibrary: () => ({ root: lib.root, repos: lib.repos }),
      onEvent: (event) => events.push(event),
      steps,
      now: () => new Date(2026, 9, 17),
      newId: () => `clip-${++n}`,
    });

    const ids = service.importUgc(files);
    expect(ids).toHaveLength(5);
    while (service.hasActive()) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(peak).toBe(2);
    const done = events.filter((e) => e.type === "done");
    expect(done).toHaveLength(5);
    expect(done.map((e) => importedMediaId(e.job.result)).sort()).toEqual([
      "clip-1",
      "clip-2",
      "clip-3",
      "clip-4",
      "clip-5",
    ]);
    expect(lib.repos.media.list()).toHaveLength(5);
    expect(events[0]?.type).toBe("queued");
  });

  it("refuses to import when no library is open", () => {
    const service = createJobService({
      getLibrary: () => null,
      onEvent: () => undefined,
      steps: fakeSteps(),
    });
    expect(() => service.importUgc(["/a/b.mov"])).toThrow(/Open a library/);
  });

  it("cancelAll stops running imports and leaves the library clean", async () => {
    const lib = await makeTempLibraryDb();
    await ensureLayout(lib.root);
    const originals = makeTempDir("originals-");
    const files = ["a.mov", "b.mov", "c.mov"].map((name) => {
      const file = path.join(originals, name);
      writeFileSync(file, "x");
      return file;
    });
    let started = 0;
    const service = createJobService({
      getLibrary: () => ({ root: lib.root, repos: lib.repos }),
      onEvent: () => undefined,
      steps: fakeSteps({ abortAt: "normalize", onStep: () => started++ }),
    });
    service.importUgc(files);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toBe(2);
    await service.cancelAll();
    expect(service.hasActive()).toBe(false);
    expect(started).toBe(2); // the queued one never started
    expect(
      listFiles(lib.root).filter((f) => !f.startsWith("library.db")),
    ).toEqual([]);
    expect(lib.repos.media.list()).toEqual([]);
  });
});

describe("sweepLibrary", () => {
  it("empties cache/tmp and removes stray .partial files, and nothing else", async () => {
    const root = makeTempDir();
    await ensureLayout(root);
    const put = (rel: string) => {
      const file = path.join(root, ...rel.split("/"));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "x");
    };
    put("cache/tmp/job-1/clip.mp4");
    put("cache/tmp/job-1/clip.mp4.partial");
    put("cache/tmp/job-2/filmstrip.jpg");
    put("clips/2026-10/a.mp4.partial");
    put("products/p1/broll/b.mp4.partial");
    put("cache/filmstrips/f.jpg.partial");
    put("clips/2026-10/keep.mp4");
    put("cache/filmstrips/keep.jpg");
    put("products/p1/image.jpg");
    put("exports/p1/2026-10-17/video.mp4");
    put("library.db");

    await sweepLibrary(root);

    expect(listFiles(root)).toEqual([
      "cache/filmstrips/keep.jpg",
      "clips/2026-10/keep.mp4",
      "exports/p1/2026-10-17/video.mp4",
      "library.db",
      "products/p1/image.jpg",
    ]);
    // The staging folder itself stays, ready for the next job.
    expect(existsSync(path.join(root, "cache", "tmp"))).toBe(true);
  });

  it("is fine on an empty or incomplete library", async () => {
    await expect(sweepLibrary(makeTempDir())).resolves.toBeUndefined();
  });
});
