import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  claim,
  exportVideo,
  NameTakenError,
  type ExportDeps,
} from "../src/main/render/exportVideo";
import type { VerifyResult, VerifyRow } from "../src/main/render/verify";
import { AbortError } from "../src/main/media/run";
import { formatLocalDate } from "../src/shared/naming";
import type { Recipe } from "../src/shared/recipe";
import { makeTempDir, makeTempLibraryDb } from "./helpers/db";
import { emptyRecipe, NOW } from "./helpers/recipe";

const DATE = formatLocalDate(NOW);

function row(
  severity: VerifyRow["severity"],
  status: VerifyRow["status"],
  name = "check",
): VerifyRow {
  return { severity, status, name, detail: `${name} detail` };
}

function verdict(rows: VerifyRow[]): VerifyResult {
  const hardFailures = rows.filter(
    (r) => r.severity === "hard" && r.status === "FAIL",
  );
  return {
    rows,
    notes: [],
    expectedSeconds: 9,
    ok: hardFailures.length === 0,
    hardFailures,
    warnings: rows.filter((r) => r.severity === "soft" && r.status === "FAIL"),
  };
}

const rendered = (outputPath: string) => ({
  cancelled: false as const,
  outputPath,
  outputSeconds: 9,
  timings: {} as never,
  concurrency: null,
});

async function setup(
  overrides: Partial<Pick<ExportDeps, "render" | "verify">> = {},
) {
  const lib = await makeTempLibraryDb();
  const product = lib.repos.products.create({
    fullName: "Levis 501",
    slug: "levis-501",
  });
  const recipe: Recipe = emptyRecipe({ id: product.id, slug: "levis-501" });
  recipe.clips = recipe.clips.map((clip, index) => ({
    ...clip,
    mediaPath: `clips/2026-10/c${index}.mp4`,
    sourceDuration: 8,
    duration: 3,
  })) as Recipe["clips"];
  lib.repos.videos.upsertDraft({
    id: recipe.id,
    productId: product.id,
    recipeJson: JSON.stringify(recipe),
  });
  const outputs: string[] = [];
  const deps: ExportDeps = {
    root: lib.root,
    repos: lib.repos,
    now: () => NOW,
    render: async (_recipe, { outputPath }) => {
      outputs.push(outputPath);
      await writeFile(outputPath, "mp4 bytes");
      return rendered(outputPath);
    },
    verify: async () => verdict([row("hard", "ok")]),
    ...overrides,
  };
  const progress: [number, string | undefined][] = [];
  const context = (jobId = "job-1", signal = new AbortController().signal) => ({
    jobId,
    signal,
    setProgress: (percent: number, stage?: string) =>
      progress.push([percent, stage]),
  });
  const exportsDir = path.join(lib.root, "exports");
  const tmpDir = path.join(lib.root, "cache", "tmp");
  return {
    ...lib,
    product,
    recipe,
    deps,
    context,
    progress,
    outputs,
    exportsDir,
    tmpDir,
  };
}

async function listAll(dir: string): Promise<string[]> {
  if (!existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listAll(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

function captionOn<T extends Recipe["clips"][number]>(
  clip: T,
  sourceCaptionId?: string,
  text = "x",
): T {
  return {
    ...clip,
    caption: {
      text,
      ...(sourceCaptionId ? { sourceCaptionId } : {}),
      style: "outline",
      position: "top",
    },
  };
}

describe("exportVideo", () => {
  it("renders in cache/tmp, then moves the mp4 and sidecar into exports and marks the row exported", async () => {
    const t = await setup();
    const result = await exportVideo(t.recipe, t.context(), t.deps);

    const folder = path.join(t.exportsDir, "levis-501", DATE);
    expect((await readdir(folder)).sort()).toEqual([
      `levis-501_no-caption_${DATE}_01.mp4`,
      `levis-501_no-caption_${DATE}_01.recipe.json`,
    ]);
    expect(result).toEqual({
      videoId: t.recipe.id,
      exportPath: `exports/levis-501/${DATE}/levis-501_no-caption_${DATE}_01.mp4`,
      warnings: [],
    });
    // The render never touched the final name.
    expect(t.outputs[0]).toBe(path.join(t.tmpDir, "job-1", "out.mp4"));
    expect(existsSync(path.join(t.tmpDir, "job-1"))).toBe(false);

    expect(t.repos.videos.get(t.recipe.id)).toMatchObject({
      status: "exported",
      exportPath: result.exportPath,
    });
    const sidecar = JSON.parse(
      await readFile(
        path.join(folder, `levis-501_no-caption_${DATE}_01.recipe.json`),
        "utf8",
      ),
    ) as Recipe;
    expect(sidecar.id).toBe(t.recipe.id);
  });

  it("gives a second export with the same hook on the same day the _02 name", async () => {
    const t = await setup();
    await exportVideo(t.recipe, t.context("job-1"), t.deps);
    const second = emptyRecipe({ id: t.product.id, slug: "levis-501" });
    second.clips = t.recipe.clips;
    t.repos.videos.upsertDraft({
      id: second.id,
      productId: t.product.id,
      recipeJson: JSON.stringify(second),
    });
    const result = await exportVideo(second, t.context("job-2"), t.deps);
    expect(result.exportPath).toMatch(/_02\.mp4$/);
    expect(
      await readdir(path.join(t.exportsDir, "levis-501", DATE)),
    ).toHaveLength(4);
  });

  it("names the file from the before caption", async () => {
    const t = await setup();
    const recipe: Recipe = {
      ...t.recipe,
      clips: [
        captionOn(t.recipe.clips[0], undefined, "I can't fix my smile"),
        t.recipe.clips[1],
        t.recipe.clips[2],
      ],
    };
    const result = await exportVideo(recipe, t.context(), t.deps);
    expect(result.exportPath).toContain(
      `levis-501_cant-fix-my-smile_${DATE}_01.mp4`,
    );
  });

  it("names the export from the product's current slug, not the draft's old one", async () => {
    const t = await setup();
    t.repos.products.update(t.product.id, { slug: "levis-new" });
    const result = await exportVideo(t.recipe, t.context(), t.deps);
    expect(result.exportPath).toMatch(/^exports\/levis-new\//);
    const sidecarPath = path.join(
      t.root,
      result.exportPath.replace(/\.mp4$/, ".recipe.json"),
    );
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8")) as Recipe;
    expect(sidecar.productSlug).toBe("levis-new");
  });

  it("exports with warnings when only a soft check fails", async () => {
    const t = await setup({
      verify: async () =>
        verdict([
          row("hard", "ok"),
          row("soft", "FAIL", "colour fidelity (before)"),
        ]),
    });
    const result = await exportVideo(t.recipe, t.context(), t.deps);
    expect(result.warnings).toEqual([
      "colour fidelity (before): colour fidelity (before) detail",
    ]);
    expect(t.repos.videos.get(t.recipe.id)?.status).toBe("exported");
    const files = await listAll(t.exportsDir);
    expect(files.filter((f) => f.endsWith(".mp4"))).toHaveLength(1);
  });

  it("fails on a hard check: nothing in exports, tmp removed, row failed", async () => {
    const t = await setup({
      verify: async () =>
        verdict([row("hard", "FAIL", "fps"), row("soft", "FAIL", "audio")]),
    });
    await expect(exportVideo(t.recipe, t.context(), t.deps)).rejects.toThrow(
      /failed its checks: fps: fps detail/,
    );
    expect(await listAll(t.exportsDir)).toEqual([]);
    expect(existsSync(path.join(t.tmpDir, "job-1"))).toBe(false);
    expect(t.repos.videos.get(t.recipe.id)?.status).toBe("failed");
  });

  it("a render that throws leaves nothing in exports and marks the row failed", async () => {
    const t = await setup({
      render: async (_recipe, { outputPath }) => {
        await writeFile(outputPath, "half a file");
        throw new Error("compositor crashed");
      },
    });
    await expect(exportVideo(t.recipe, t.context(), t.deps)).rejects.toThrow(
      "compositor crashed",
    );
    expect(await listAll(t.exportsDir)).toEqual([]);
    expect(existsSync(path.join(t.tmpDir, "job-1"))).toBe(false);
    expect(t.repos.videos.get(t.recipe.id)?.status).toBe("failed");
  });

  it("cancel (render reports cancelled) throws AbortError, cleans up and keeps the draft", async () => {
    const t = await setup({
      render: async () => ({ cancelled: true, outputPath: null }),
    });
    await expect(
      exportVideo(t.recipe, t.context(), t.deps),
    ).rejects.toBeInstanceOf(AbortError);
    expect(await listAll(t.exportsDir)).toEqual([]);
    expect(existsSync(path.join(t.tmpDir, "job-1"))).toBe(false);
    expect(t.repos.videos.get(t.recipe.id)?.status).toBe("draft");
  });

  it("an abort during verify keeps the draft and writes nothing", async () => {
    const controller = new AbortController();
    const t = await setup({
      verify: async () => {
        controller.abort();
        throw new AbortError();
      },
    });
    await expect(
      exportVideo(t.recipe, t.context("job-1", controller.signal), t.deps),
    ).rejects.toBeInstanceOf(AbortError);
    expect(await listAll(t.exportsDir)).toEqual([]);
    expect(t.repos.videos.get(t.recipe.id)?.status).toBe("draft");
  });

  it("only the rendering stage moves the bar (0-90%); the checks fill the rest", async () => {
    const t = await setup({
      render: async (_recipe, { outputPath, onProgress }) => {
        onProgress({ type: "progress", stage: "bundling", progress: 100 });
        onProgress({ type: "progress", stage: "rendering", progress: 50 });
        await writeFile(outputPath, "mp4");
        return rendered(outputPath);
      },
    });
    await exportVideo(t.recipe, t.context(), t.deps);
    const percents = t.progress.map(([percent]) => percent);
    // The bundling tick of 100 must not have become 100%.
    const at = percents.indexOf(45);
    expect(at).toBeGreaterThan(0);
    expect(Math.max(...percents.slice(0, at))).toBe(0);
    expect(t.progress.some(([, stage]) => stage === "Checking")).toBe(true);
  });

  it("counts each source caption once per video and ignores deleted ones", async () => {
    const t = await setup();
    const a = t.repos.captions.create({ text: "a", slot: "any" });
    const b = t.repos.captions.create({ text: "b", slot: "any" });
    const gone = t.repos.captions.create({ text: "gone", slot: "any" });
    t.repos.captions.remove(gone.id);
    const recipe: Recipe = {
      ...t.recipe,
      clips: [
        captionOn(t.recipe.clips[0], a.id),
        captionOn(t.recipe.clips[1], a.id),
        captionOn(t.recipe.clips[2], gone.id),
      ],
    };
    await exportVideo(recipe, t.context(), t.deps);
    expect(t.repos.captions.get(a.id)?.useCount).toBe(1);
    expect(t.repos.captions.get(b.id)?.useCount).toBe(0);
  });

  it("commits the exported row and the use counts together or not at all", async () => {
    const t = await setup();
    const a = t.repos.captions.create({ text: "a", slot: "any" });
    const b = t.repos.captions.create({ text: "b", slot: "any" });
    const recipe: Recipe = {
      ...t.recipe,
      clips: [
        captionOn(t.recipe.clips[0], a.id),
        captionOn(t.recipe.clips[1], b.id),
        t.recipe.clips[2],
      ],
    };
    const real = t.repos.captions.incrementUseCount;
    let calls = 0;
    vi.spyOn(t.repos.captions, "incrementUseCount").mockImplementation((id) => {
      calls += 1;
      if (calls === 2) {
        throw new Error("disk full");
      }
      return real(id);
    });
    await expect(exportVideo(recipe, t.context(), t.deps)).rejects.toThrow(
      "disk full",
    );
    // Nothing half done: no exported row, no counts, no file claiming to be an export.
    expect(t.repos.videos.get(recipe.id)?.status).toBe("failed");
    expect(t.repos.captions.get(a.id)?.useCount).toBe(0);
    expect(await listAll(t.exportsDir)).toEqual([]);
  });

  it("never overwrites: an existing export of the same name pushes the new one to the next number", async () => {
    const t = await setup();
    const folder = path.join(t.exportsDir, "levis-501", DATE);
    await mkdir(folder, { recursive: true });
    const existing = path.join(folder, `levis-501_no-caption_${DATE}_01.mp4`);
    await writeFile(existing, "somebody else's video");
    const result = await exportVideo(t.recipe, t.context(), t.deps);
    expect(result.exportPath).toMatch(/_02\.mp4$/);
    expect(await readFile(existing, "utf8")).toBe("somebody else's video");
  });

  it("a leftover sidecar alone also burns its number", async () => {
    const t = await setup();
    const folder = path.join(t.exportsDir, "levis-501", DATE);
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, `levis-501_no-caption_${DATE}_01.recipe.json`),
      "{}",
    );
    const result = await exportVideo(t.recipe, t.context(), t.deps);
    expect(result.exportPath).toMatch(/_02\.mp4$/);
  });

  it("rejects a missing product before touching the disk", async () => {
    const t = await setup();
    await expect(
      exportVideo({ ...t.recipe, productId: "nope" }, t.context(), t.deps),
    ).rejects.toThrow(/product no longer exists/);
    expect(existsSync(t.tmpDir)).toBe(false);
  });
});

describe("claim", () => {
  it("copies a file to a new name and keeps the source", async () => {
    const dir = makeTempDir();
    const from = path.join(dir, "a.txt");
    const to = path.join(dir, "b.txt");
    await writeFile(from, "hello");
    await claim(from, to);
    expect(await readFile(to, "utf8")).toBe("hello");
    expect(existsSync(from)).toBe(true);
  });

  it("refuses to replace an existing target and leaves it untouched", async () => {
    const dir = makeTempDir();
    const from = path.join(dir, "a.txt");
    const to = path.join(dir, "b.txt");
    await writeFile(from, "new");
    await writeFile(to, "old");
    await expect(claim(from, to)).rejects.toBeInstanceOf(NameTakenError);
    expect(await readFile(to, "utf8")).toBe("old");
  });
});
