import { describe, expect, it } from "vitest";
import { createVideoService } from "../src/main/videos/videoService";
import {
  createEmptyRecipe,
  DEFAULT_CLIP_DURATIONS,
} from "../src/shared/recipe";
import { randomUUID } from "node:crypto";
import { access, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeTempLibraryDb } from "./helpers/db";
import { NOW } from "./helpers/recipe";

async function setup() {
  const lib = await makeTempLibraryDb();
  const service = createVideoService({
    getLibrary: () => ({ repos: lib.repos }),
  });
  const product = lib.repos.products.create({ fullName: "Aloe", slug: "aloe" });
  const recipeFor = (id = product.id) =>
    createEmptyRecipe(
      { id, slug: "aloe" },
      { clipDurations: { ...DEFAULT_CLIP_DURATIONS } },
      { id: randomUUID(), now: NOW },
    );
  return { ...lib, service, product, recipeFor };
}

describe("videoService.saveDraft", () => {
  it("creates a draft addressed by the recipe id", async () => {
    const { service, repos, recipeFor } = await setup();
    const recipe = recipeFor();
    const result = service.saveDraft(recipe);
    expect(result).toMatchObject({ ok: true, value: { id: recipe.id } });
    const row = repos.videos.get(recipe.id);
    expect(row?.status).toBe("draft");
    expect(JSON.parse(row?.recipeJson ?? "{}").id).toBe(recipe.id);
  });

  it("updates in place, keeping created_at", async () => {
    const { service, repos, recipeFor } = await setup();
    const recipe = recipeFor();
    service.saveDraft(recipe);
    const before = repos.videos.get(recipe.id);
    const edited = {
      ...recipe,
      clips: [
        {
          ...recipe.clips[0],
          mediaPath: "clips/2026-10/a.mp4",
          sourceDuration: 8,
        },
        recipe.clips[1],
        recipe.clips[2],
      ] as typeof recipe.clips,
    };
    service.saveDraft(edited);
    const after = repos.videos.get(recipe.id);
    expect(repos.videos.list()).toHaveLength(1);
    expect(after?.createdAt).toBe(before?.createdAt);
    expect(after?.updatedAt).not.toBe(before?.updatedAt);
    expect(JSON.parse(after?.recipeJson ?? "{}").clips[0].mediaPath).toBe(
      "clips/2026-10/a.mp4",
    );
  });

  it("refuses a missing or archived product when creating", async () => {
    const { service, repos, product, recipeFor } = await setup();
    expect(service.saveDraft(recipeFor("nope"))).toMatchObject({
      ok: false,
      code: "product-missing",
    });
    repos.products.archive(product.id);
    expect(service.saveDraft(recipeFor())).toMatchObject({
      ok: false,
      code: "product-missing",
    });
    expect(repos.videos.list()).toEqual([]);
  });

  it("still updates an existing draft after its product was archived", async () => {
    const { service, repos, product, recipeFor } = await setup();
    const recipe = recipeFor();
    expect(service.saveDraft(recipe).ok).toBe(true);
    repos.products.archive(product.id);
    const edited = { ...recipe, updatedAt: "2026-10-18T00:00:00.000Z" };
    expect(service.saveDraft(edited).ok).toBe(true);
    expect(repos.videos.get(recipe.id)?.recipeJson).toContain("2026-10-18");
  });

  it("never overwrites a video that is not a draft", async () => {
    const { service, repos, recipeFor } = await setup();
    const recipe = recipeFor();
    service.saveDraft(recipe);
    repos.videos.update(recipe.id, { status: "exported" });
    const original = repos.videos.get(recipe.id)?.recipeJson;
    expect(
      service.saveDraft({ ...recipe, updatedAt: NOW.toISOString() }),
    ).toMatchObject({ ok: false, code: "not-draft" });
    expect(repos.videos.get(recipe.id)?.recipeJson).toBe(original);
  });

  it("rejects absolute, backslash and traversal media paths", async () => {
    const { service, repos, recipeFor } = await setup();
    for (const bad of [
      "/etc/passwd",
      "..\\x.mp4",
      "clips/../../x.mp4",
      "C:\\x.mp4",
    ]) {
      const recipe = recipeFor();
      recipe.clips[0] = {
        ...recipe.clips[0],
        mediaPath: bad,
        sourceDuration: 5,
      };
      expect(service.saveDraft(recipe)).toMatchObject({
        ok: false,
        code: "invalid",
      });
    }
    expect(repos.videos.list()).toEqual([]);
  });

  it("does not let a draft change its product", async () => {
    const { service, repos, recipeFor } = await setup();
    const other = repos.products.create({ fullName: "B", slug: "b" });
    const recipe = recipeFor();
    service.saveDraft(recipe);
    expect(service.saveDraft({ ...recipe, productId: other.id })).toMatchObject(
      {
        ok: false,
        code: "invalid",
      },
    );
  });
});

describe("videoService list/get/remove", () => {
  it("lists drafts newest first and filters by status", async () => {
    const { service, repos, recipeFor } = await setup();
    const a = recipeFor();
    const b = recipeFor();
    service.saveDraft(a);
    service.saveDraft(b);
    repos.videos.update(a.id, { status: "exported" });
    expect(service.list({ status: "draft" }).map((v) => v.id)).toEqual([b.id]);
    expect(service.list().map((v) => v.id)).toEqual([a.id, b.id]);
    expect(service.get(b.id)?.id).toBe(b.id);
    expect(service.get("nope")).toBeNull();
  });

  it("removes drafts and exported records (history keeps nothing it must not)", async () => {
    const { service, repos, recipeFor } = await setup();
    const draft = recipeFor();
    const done = recipeFor();
    service.saveDraft(draft);
    service.saveDraft(done);
    repos.videos.update(done.id, { status: "exported" });
    expect(await service.remove(draft.id)).toEqual({
      ok: true,
      value: { warning: null },
    });
    expect(await service.remove(draft.id)).toMatchObject({
      ok: false,
      code: "not-found",
    });
    expect(await service.remove(done.id)).toEqual({
      ok: true,
      value: { warning: null },
    });
    expect(repos.videos.get(done.id)).toBeNull();
  });

  it("refuses to remove a video while it is exporting", async () => {
    const lib = await makeTempLibraryDb();
    const service = createVideoService({
      getLibrary: () => ({ repos: lib.repos }),
      exports: { start: () => "j", activeJobId: () => "job-1" },
    });
    const product = lib.repos.products.create({ fullName: "A", slug: "a" });
    const video = lib.repos.videos.create({
      productId: product.id,
      recipeJson: "{}",
    });
    expect(await service.remove(video.id)).toMatchObject({
      ok: false,
      code: "exporting",
    });
    expect(lib.repos.videos.get(video.id)).not.toBeNull();
  });

  it("throws when no library is open", () => {
    const service = createVideoService({ getLibrary: () => null });
    expect(() => service.list()).toThrow(/Open a library/);
  });
});

describe("videoService delete with files, and exportFiles", () => {
  const REL = "exports/aloe/2026-10-17/aloe_hook_2026-10-17_01.mp4";
  const SIDECAR = "exports/aloe/2026-10-17/aloe_hook_2026-10-17_01.recipe.json";

  async function exportedSetup(
    trash?: (file: string) => Promise<void>,
    exportPath: string = REL,
  ) {
    const lib = await makeTempLibraryDb();
    const calls: string[] = [];
    const service = createVideoService({
      getLibrary: () => ({ repos: lib.repos }),
      getRoot: () => lib.root,
      trash:
        trash ??
        (async (file) => {
          calls.push(file);
          await rm(file);
        }),
    });
    const product = lib.repos.products.create({
      fullName: "Aloe",
      slug: "aloe",
    });
    await mkdir(path.dirname(path.join(lib.root, REL)), { recursive: true });
    await writeFile(path.join(lib.root, REL), "video");
    await writeFile(path.join(lib.root, SIDECAR), "{}");
    const video = lib.repos.videos.create({
      productId: product.id,
      recipeJson: "{}",
      status: "exported",
      exportPath,
    });
    return { ...lib, service, video, calls };
  }

  it("keeps the files when deleteFile is off", async () => {
    const { service, video, root, repos, calls } = await exportedSetup();
    expect(await service.remove(video.id)).toEqual({
      ok: true,
      value: { warning: null },
    });
    expect(repos.videos.get(video.id)).toBeNull();
    expect(calls).toEqual([]);
    await expect(access(path.join(root, REL))).resolves.toBeUndefined();
    await expect(access(path.join(root, SIDECAR))).resolves.toBeUndefined();
  });

  it("trashes the mp4 then the sidecar, then deletes the row", async () => {
    const { service, video, root, repos, calls } = await exportedSetup();
    const result = await service.remove(video.id, { deleteFile: true });
    expect(result).toEqual({ ok: true, value: { warning: null } });
    expect(calls.map((c) => path.basename(c))).toEqual([
      "aloe_hook_2026-10-17_01.mp4",
      "aloe_hook_2026-10-17_01.recipe.json",
    ]);
    await expect(access(path.join(root, REL))).rejects.toThrow();
    expect(repos.videos.get(video.id)).toBeNull();
  });

  it("treats a file that is already gone as done", async () => {
    const { service, video, root, repos } = await exportedSetup();
    await rm(path.join(root, REL));
    await rm(path.join(root, SIDECAR));
    expect(await service.remove(video.id, { deleteFile: true })).toEqual({
      ok: true,
      value: { warning: null },
    });
    expect(repos.videos.get(video.id)).toBeNull();
  });

  it("keeps the row when the mp4 cannot be trashed, so the user can retry", async () => {
    const { service, video, repos } = await exportedSetup(async () => {
      throw new Error("Operation not permitted");
    });
    const result = await service.remove(video.id, { deleteFile: true });
    expect(result).toMatchObject({ ok: false, code: "delete-failed" });
    expect(result.ok ? "" : result.message).toContain(
      "Operation not permitted",
    );
    expect(repos.videos.get(video.id)).not.toBeNull();
  });

  it("only warns when the sidecar cannot be trashed", async () => {
    const trashed: string[] = [];
    const { service, video, repos } = await exportedSetup(async (file) => {
      if (file.endsWith(".recipe.json")) {
        throw new Error("busy");
      }
      trashed.push(file);
    });
    const result = await service.remove(video.id, { deleteFile: true });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.warning : "").toContain("recipe file");
    expect(trashed).toHaveLength(1);
    expect(repos.videos.get(video.id)).toBeNull();
  });

  it("refuses a path outside the exports folder and trashes nothing", async () => {
    const { service, video, repos, calls } = await exportedSetup(
      undefined,
      "clips/2026-10/a.mp4",
    );
    const result = await service.remove(video.id, { deleteFile: true });
    expect(result).toMatchObject({ ok: false, code: "delete-failed" });
    expect(calls).toEqual([]);
    expect(repos.videos.get(video.id)).not.toBeNull();
  });

  it("refuses a symlink inside exports/ that leads out of it", async () => {
    const { service, video, repos, calls, root } = await exportedSetup();
    const outside = path.join(root, "clips", "secret.mp4");
    await mkdir(path.dirname(outside), { recursive: true });
    await writeFile(outside, "x");
    await rm(path.join(root, REL));
    await symlink(outside, path.join(root, REL));
    const result = await service.remove(video.id, { deleteFile: true });
    expect(result).toMatchObject({ ok: false, code: "delete-failed" });
    expect(calls).toEqual([]);
    await expect(access(outside)).resolves.toBeUndefined();
    expect(repos.videos.get(video.id)).not.toBeNull();
  });

  it("ignores deleteFile for a draft", async () => {
    const { service, repos, root, calls } = await exportedSetup();
    const product = repos.products.list()[0];
    const draft = repos.videos.create({
      productId: product?.id ?? "",
      recipeJson: "{}",
    });
    expect(await service.remove(draft.id, { deleteFile: true })).toEqual({
      ok: true,
      value: { warning: null },
    });
    expect(calls).toEqual([]);
    await expect(access(path.join(root, REL))).resolves.toBeUndefined();
  });

  it("exportFiles reports present and missing, and skips non-exported rows", async () => {
    const { service, video, root, repos } = await exportedSetup();
    const draft = repos.videos.create({
      productId: video.productId,
      recipeJson: "{}",
    });
    expect(await service.exportFiles([video.id, draft.id, "nope"])).toEqual({
      [video.id]: "present",
    });
    await rm(path.join(root, REL));
    expect(await service.exportFiles([video.id])).toEqual({
      [video.id]: "missing",
    });
  });
});
