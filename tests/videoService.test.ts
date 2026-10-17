import { describe, expect, it } from "vitest";
import { createVideoService } from "../src/main/videos/videoService";
import {
  createEmptyRecipe,
  DEFAULT_CLIP_DURATIONS,
} from "../src/shared/recipe";
import { randomUUID } from "node:crypto";
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

  it("removes drafts only", async () => {
    const { service, repos, recipeFor } = await setup();
    const draft = recipeFor();
    const done = recipeFor();
    service.saveDraft(draft);
    service.saveDraft(done);
    repos.videos.update(done.id, { status: "exported" });
    expect(service.remove(draft.id)).toEqual({ ok: true, value: true });
    expect(service.remove(draft.id)).toMatchObject({
      ok: false,
      code: "not-found",
    });
    expect(service.remove(done.id)).toMatchObject({
      ok: false,
      code: "not-draft",
    });
    expect(repos.videos.get(done.id)).not.toBeNull();
  });

  it("throws when no library is open", () => {
    const service = createVideoService({ getLibrary: () => null });
    expect(() => service.list()).toThrow(/Open a library/);
  });
});
