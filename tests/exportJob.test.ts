import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createJobService } from "../src/main/jobs";
import type { ExportDeps } from "../src/main/render/exportVideo";
import { createVideoService } from "../src/main/videos/videoService";
import type { JobEvent } from "../src/shared/jobs";
import type { Recipe } from "../src/shared/recipe";
import { makeTempLibraryDb } from "./helpers/db";
import { emptyRecipe } from "./helpers/recipe";

// A render the test finishes by hand, so the export job can be held "running".
function gatedRender() {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const render: ExportDeps["render"] = async (_recipe, { outputPath }) => {
    await gate;
    writeFileSync(outputPath, "mp4");
    return {
      cancelled: false,
      outputPath,
      outputSeconds: 9,
      timings: {} as never,
      concurrency: null,
    };
  };
  return { render, release };
}

async function setup() {
  const lib = await makeTempLibraryDb();
  const product = lib.repos.products.create({
    fullName: "Aloe Gel",
    shortName: "Aloe",
    slug: "aloe",
  });
  const recipe: Recipe = emptyRecipe({ id: product.id, slug: "aloe" });
  recipe.clips = recipe.clips.map((clip, index) => ({
    ...clip,
    mediaPath: `clips/2026-10/c${index}.mp4`,
    sourceDuration: 8,
    duration: 3,
  })) as Recipe["clips"];
  // The export looks for its source clips on disk before rendering.
  mkdirSync(path.join(lib.root, "clips", "2026-10"), { recursive: true });
  for (const clip of recipe.clips) {
    writeFileSync(path.join(lib.root, ...clip.mediaPath.split("/")), "clip");
  }
  const events: JobEvent[] = [];
  const gate = gatedRender();
  const revealed: string[] = [];
  const jobs = createJobService({
    getLibrary: () => ({ root: lib.root, repos: lib.repos }),
    onEvent: (event) => events.push(event),
    exporter: {
      render: gate.render,
      verify: async () => ({
        rows: [],
        notes: [],
        expectedSeconds: 9,
        ok: true,
        hardFailures: [],
        warnings: [],
      }),
    },
  });
  const videos = createVideoService({
    getLibrary: () => ({ repos: lib.repos }),
    exports: {
      start: (r) => jobs.exportVideo(r),
      activeJobId: (id) => jobs.activeExportJobId(id),
    },
    getRoot: () => lib.root,
    reveal: (p) => revealed.push(p),
  });
  const settle = async () => {
    for (let i = 0; i < 50; i += 1) {
      if (
        jobs
          .list()
          .every((j) => ["done", "failed", "cancelled"].includes(j.state))
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("export job did not settle");
  };
  return {
    ...lib,
    product,
    recipe,
    events,
    jobs,
    videos,
    gate,
    revealed,
    settle,
  };
}

describe("export job + video service", () => {
  it("queues a render job labelled with the product and finishes with the exported video", async () => {
    const t = await setup();
    const started = t.videos.export(t.recipe);
    expect(started.ok).toBe(true);
    const jobId = started.ok ? started.value.jobId : "";
    const job = t.jobs.list().find((j) => j.id === jobId);
    expect(job).toMatchObject({
      type: "render",
      label: "Exporting Aloe",
      productId: t.product.id,
    });
    expect(t.jobs.activeExportJobId(t.recipe.id)).toBe(jobId);
    // The product has an active job, so it cannot be archived or deleted meanwhile.
    expect(t.jobs.hasActiveForProduct(t.product.id)).toBe(true);

    t.gate.release();
    await t.settle();
    const done = t.events.find((e) => e.type === "done");
    expect(done?.job.result).toMatchObject({ videoId: t.recipe.id });
    expect(t.repos.videos.get(t.recipe.id)?.status).toBe("exported");
    expect(t.jobs.activeExportJobId(t.recipe.id)).toBeNull();
  });

  it("saveDraft and remove answer 'exporting' while the render job is active, then work again after a failure", async () => {
    const t = await setup();
    t.videos.export(t.recipe);
    expect(t.videos.saveDraft(t.recipe)).toMatchObject({
      ok: false,
      code: "exporting",
    });
    expect(await t.videos.remove(t.recipe.id)).toMatchObject({
      ok: false,
      code: "exporting",
    });
    expect(t.videos.export(t.recipe)).toMatchObject({
      ok: false,
      code: "already-exporting",
    });
    // The draft row was not touched by the refused save.
    expect(t.repos.videos.get(t.recipe.id)?.status).toBe("draft");

    const [job] = t.jobs.list();
    t.jobs.cancel(job.id);
    t.gate.release();
    await t.settle();
    expect(t.events.some((e) => e.type === "cancelled")).toBe(true);
    expect(t.videos.saveDraft(t.recipe)).toMatchObject({ ok: true });
    expect(t.repos.videos.get(t.recipe.id)?.status).toBe("draft");
  });

  it("refuses to export a recipe with an empty slot without queuing anything", async () => {
    const t = await setup();
    const empty = emptyRecipe({ id: t.product.id, slug: "aloe" });
    expect(t.videos.export(empty)).toMatchObject({
      ok: false,
      code: "not-renderable",
    });
    expect(t.jobs.list()).toEqual([]);
  });

  it("refuses a missing product", async () => {
    const t = await setup();
    const result = t.videos.export({ ...t.recipe, productId: "nope" });
    expect(result).toMatchObject({ ok: false, code: "product-missing" });
    expect(t.jobs.list()).toEqual([]);
  });

  it("refuses to re-export an exported video", async () => {
    const t = await setup();
    t.videos.export(t.recipe);
    t.gate.release();
    await t.settle();
    expect(t.videos.export(t.recipe)).toMatchObject({
      ok: false,
      code: "not-draft",
    });
  });

  it("a failed export can be saved and deleted like a draft", async () => {
    const t = await setup();
    t.repos.videos.upsertDraft({
      id: t.recipe.id,
      productId: t.product.id,
      recipeJson: JSON.stringify(t.recipe),
    });
    t.repos.videos.update(t.recipe.id, { status: "failed" });
    expect(t.videos.saveDraft(t.recipe)).toMatchObject({ ok: true });
    expect(t.repos.videos.get(t.recipe.id)?.status).toBe("draft");

    t.repos.videos.update(t.recipe.id, { status: "failed" });
    expect(await t.videos.remove(t.recipe.id)).toEqual({
      ok: true,
      value: { warning: null },
    });
    expect(t.repos.videos.get(t.recipe.id)).toBeNull();
  });

  it("an exported video cannot be saved over, but its record can be deleted (3.6)", async () => {
    const t = await setup();
    t.repos.videos.upsertDraft({
      id: t.recipe.id,
      productId: t.product.id,
      recipeJson: JSON.stringify(t.recipe),
    });
    t.repos.videos.update(t.recipe.id, {
      status: "exported",
      exportPath: "exports/aloe/d/a.mp4",
    });
    expect(t.videos.saveDraft(t.recipe)).toMatchObject({
      ok: false,
      code: "not-draft",
    });
    expect(await t.videos.remove(t.recipe.id)).toEqual({
      ok: true,
      value: { warning: null },
    });
    expect(t.repos.videos.get(t.recipe.id)).toBeNull();
  });
});

describe("videoService.reveal", () => {
  it("resolves the path from the row against the library root", async () => {
    const t = await setup();
    t.repos.videos.upsertDraft({
      id: t.recipe.id,
      productId: t.product.id,
      recipeJson: "{}",
    });
    t.repos.videos.update(t.recipe.id, {
      status: "exported",
      exportPath: "exports/aloe/2026-10-17/a.mp4",
    });
    const target = path.join(t.root, "exports", "aloe", "2026-10-17", "a.mp4");

    // File gone: a readable refusal, nothing revealed.
    expect(await t.videos.reveal(t.recipe.id)).toMatchObject({
      ok: false,
      code: "not-found",
    });
    expect(t.revealed).toEqual([]);

    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "mp4");
    expect(await t.videos.reveal(t.recipe.id)).toEqual({
      ok: true,
      value: true,
    });
    expect(t.revealed).toEqual([target]);
  });

  it("refuses a draft or an unknown id", async () => {
    const t = await setup();
    t.repos.videos.upsertDraft({
      id: t.recipe.id,
      productId: t.product.id,
      recipeJson: "{}",
    });
    expect(await t.videos.reveal(t.recipe.id)).toMatchObject({ ok: false });
    expect(await t.videos.reveal("nope")).toMatchObject({ ok: false });
    expect(t.revealed).toEqual([]);
  });
});

vi.setConfig({ testTimeout: 10_000 });
