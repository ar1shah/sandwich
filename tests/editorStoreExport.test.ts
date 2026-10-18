import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPORT_BUSY_MESSAGE,
  useEditorStore,
} from "../src/renderer/features/editor/editorStore";
import { useJobsStore } from "../src/renderer/features/jobs/jobsStore";
import { useProductsStore } from "../src/renderer/features/products/productsStore";
import { useSettingsStore } from "../src/renderer/features/settings/settingsStore";
import type { JobInfo, JobState } from "../src/shared/jobs";
import type { ProductSummary } from "../src/shared/products";
import type { Recipe } from "../src/shared/recipe";
import { DEFAULT_EDITOR_SETTINGS } from "../src/shared/settings";
import { emptyRecipe } from "./helpers/recipe";

const PRODUCT = {
  id: "p1",
  slug: "p-one",
  fullName: "Product One",
  shortName: null,
  imagePath: null,
  lastUsedAt: null,
  archivedAt: null,
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
} as unknown as ProductSummary;

function filledRecipe(): Recipe {
  const recipe = emptyRecipe();
  recipe.clips = recipe.clips.map((clip, index) => ({
    ...clip,
    mediaPath: `clips/2026-10/c${index}.mp4`,
    sourceDuration: 8,
    duration: 3,
  })) as Recipe["clips"];
  return recipe;
}

let seq = 0;
function renderJob(
  id: string,
  state: JobState,
  extra: Partial<JobInfo> = {},
): JobInfo {
  return {
    id,
    type: "render",
    label: "Exporting",
    state,
    percent: 10,
    seq: ++seq,
    order: seq,
    updatedAt: "2026-10-17T00:00:00.000Z",
    ...extra,
  };
}

function makeApi() {
  const calls = {
    exported: [] as Recipe[],
    openDraftWrites: [] as (string | null)[],
  };
  const api = {
    jobs: {
      cancel: vi.fn(async () => true),
      list: vi.fn(async () => []),
      onEvent: vi.fn(() => () => undefined),
    },
    files: { pathsFor: () => [] },
    media: { byPaths: vi.fn(async () => []) },
    products: {
      list: vi.fn(async () => [PRODUCT]),
      touchLastUsed: vi.fn(async () => ({ ok: true, value: PRODUCT })),
    },
    settings: {
      get: vi.fn(async () => DEFAULT_EDITOR_SETTINGS),
      getOpenDraft: vi.fn(async () => null),
      setOpenDraft: vi.fn(async (id: string | null) => {
        calls.openDraftWrites.push(id);
      }),
    },
    videos: {
      saveDraft: vi.fn(async (recipe: Recipe) => ({
        ok: true,
        value: { id: recipe.id, updatedAt: "y" },
      })),
      get: vi.fn(async () => null),
      export: vi.fn(async (recipe: Recipe) => {
        calls.exported.push(recipe);
        return { ok: true, value: { jobId: "render-1" } };
      }),
    },
  };
  return { api, calls };
}

let ctx: ReturnType<typeof makeApi>;
const editor = () => useEditorStore.getState();

beforeEach(() => {
  ctx = makeApi();
  vi.stubGlobal("window", { api: ctx.api });
  useEditorStore.setState({
    draft: filledRecipe(),
    product: PRODUCT,
    selectedSlot: null,
    slotMedia: {},
    pending: {},
    missing: {},
    slotError: {},
    notice: null,
    saveError: null,
    persisted: true,
    epoch: 0,
    switching: false,
    exportState: { kind: "idle" },
  });
  useJobsStore.setState({ jobs: {} });
  useProductsStore.setState({
    products: [PRODUCT],
    loaded: true,
    mediaBase: null,
  });
  useSettingsStore.setState({
    settings: DEFAULT_EDITOR_SETTINGS,
    loaded: true,
  });
});

describe("exportVideo", () => {
  it("sends the draft, then follows the render job to done", async () => {
    await editor().exportVideo();
    expect(ctx.calls.exported).toHaveLength(1);
    expect(editor().exportState).toEqual({
      kind: "running",
      jobId: "render-1",
    });

    await editor().handleJob(
      renderJob("render-1", "done", {
        percent: 100,
        result: {
          videoId: editor().draft!.id,
          exportPath:
            "exports/p-one/2026-10-17/p-one_no-caption_2026-10-17_01.mp4",
          warnings: ["colour fidelity (before): off"],
        },
      }),
    );
    expect(editor().exportState).toEqual({
      kind: "done",
      videoId: editor().draft!.id,
      exportPath: "exports/p-one/2026-10-17/p-one_no-caption_2026-10-17_01.mp4",
      fileName: "p-one_no-caption_2026-10-17_01.mp4",
      warnings: ["colour fidelity (before): off"],
    });
    // A restart must not try to reopen the exported video as a draft.
    expect(ctx.calls.openDraftWrites).toContain(null);
  });

  it("does nothing while a slot has no clip, and says why", async () => {
    const draft = editor().draft!;
    useEditorStore.setState({
      draft: {
        ...draft,
        clips: [
          draft.clips[0],
          draft.clips[1],
          { ...draft.clips[2], mediaPath: "" },
        ],
      },
    });
    await editor().exportVideo();
    expect(ctx.api.videos.export).not.toHaveBeenCalled();
    expect(editor().exportState.kind).toBe("idle");
    expect(editor().notice).toMatch(/every slot/i);
  });

  it("does nothing while an import is running or a clip is missing", async () => {
    useEditorStore.setState({
      pending: { before: { jobId: "j", name: "a.mov" } },
    });
    await editor().exportVideo();
    expect(editor().notice).toMatch(/finish importing/i);
    useEditorStore.setState({
      pending: {},
      missing: { after: true },
      notice: null,
    });
    await editor().exportVideo();
    expect(editor().notice).toMatch(/missing/i);
    expect(ctx.api.videos.export).not.toHaveBeenCalled();
  });

  it("shows the refusal from main as a failed export", async () => {
    ctx.api.videos.export.mockResolvedValueOnce({
      ok: false,
      code: "product-missing",
      message: "That product no longer exists or was archived.",
    } as never);
    await editor().exportVideo();
    expect(editor().exportState).toEqual({
      kind: "failed",
      message: "That product no longer exists or was archived.",
    });
  });

  it("a failed job shows its error; going back to editing unlocks the draft", async () => {
    await editor().exportVideo();
    await editor().handleJob(
      renderJob("render-1", "failed", { error: "fps: got 25" }),
    );
    expect(editor().exportState).toEqual({
      kind: "failed",
      message: "fps: got 25",
    });
    editor().dismissExport();
    expect(editor().exportState.kind).toBe("idle");
  });

  it("a cancelled job returns to editing with the draft untouched", async () => {
    await editor().exportVideo();
    editor().cancelExport();
    expect(ctx.api.jobs.cancel).toHaveBeenCalledWith("render-1");
    await editor().handleJob(renderJob("render-1", "cancelled"));
    expect(editor().exportState.kind).toBe("idle");
    expect(editor().draft).not.toBeNull();
  });

  it("applies a job that finished before its id was known", async () => {
    useJobsStore.setState({
      jobs: {
        "render-1": renderJob("render-1", "failed", { error: "boom" }),
      },
    });
    await editor().exportVideo();
    expect(editor().exportState).toEqual({ kind: "failed", message: "boom" });
  });
});

describe("the draft while exporting", () => {
  it("refuses to start, open or close a draft while the render is running", async () => {
    await editor().exportVideo();
    const draftId = editor().draft!.id;

    await editor().startDraft(PRODUCT);
    expect(editor().notice).toBe(EXPORT_BUSY_MESSAGE);
    expect(editor().draft!.id).toBe(draftId);

    await editor().closeDraft();
    expect(editor().draft!.id).toBe(draftId);
    expect(editor().exportState.kind).toBe("running");

    expect(await editor().openDraft("another")).toEqual({
      ok: false,
      message: EXPORT_BUSY_MESSAGE,
    });
    expect(editor().exportState.kind).toBe("running");
  });

  it("freezes edits from the click until the panel is left", async () => {
    await editor().exportVideo();
    const before = editor().draft;
    editor().setZoom("before", true);
    editor().setMuted("after", true);
    editor().setCaptionText("before", "late edit");
    editor().setTrim("before", { start: 1, duration: 2 }, "now");
    editor().clearSlot("after");
    expect(editor().draft).toBe(before);
    expect(ctx.api.videos.saveDraft).not.toHaveBeenCalled();

    await editor().handleJob(renderJob("render-1", "failed", { error: "x" }));
    editor().setZoom("before", true);
    expect(editor().draft).toBe(before); // still frozen until dismissed
    editor().dismissExport();
    editor().setZoom("before", true);
    expect(editor().draft).not.toBe(before);
  });
});

describe("finishing an export", () => {
  async function exportDone() {
    await editor().exportVideo();
    await editor().handleJob(
      renderJob("render-1", "done", {
        result: {
          videoId: editor().draft!.id,
          exportPath: "exports/p-one/d/x.mp4",
          warnings: [],
        },
      }),
    );
  }

  it("Done clears the draft without saving it", async () => {
    await exportDone();
    await editor().finishExport();
    expect(editor().draft).toBeNull();
    expect(editor().exportState.kind).toBe("idle");
    expect(ctx.api.videos.saveDraft).not.toHaveBeenCalled();
  });

  it("closing the done draft by any route does not try to save the exported video", async () => {
    await exportDone();
    await editor().closeDraft();
    expect(editor().draft).toBeNull();
    expect(editor().saveError).toBeNull();
    expect(ctx.api.videos.saveDraft).not.toHaveBeenCalled();
  });

  it("New video, same product starts a fresh empty draft for the product", async () => {
    await exportDone();
    const oldId = editor().draft!.id;
    await editor().newVideoSameProduct();
    const draft = editor().draft!;
    expect(draft.id).not.toBe(oldId);
    expect(draft.productId).toBe("p1");
    expect(draft.clips.every((clip) => clip.mediaPath === "")).toBe(true);
    expect(editor().exportState.kind).toBe("idle");
    expect(editor().product).toEqual(PRODUCT);
  });
});
