import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRIM_SAVE_DEBOUNCE_MS,
  useEditorStore,
} from "../src/renderer/features/editor/editorStore";
import { useJobsStore } from "../src/renderer/features/jobs/jobsStore";
import { useProductsStore } from "../src/renderer/features/products/productsStore";
import { useSettingsStore } from "../src/renderer/features/settings/settingsStore";
import type { JobInfo, JobState } from "../src/shared/jobs";
import type { Media, Video } from "../src/shared/library";
import type { ProductSummary } from "../src/shared/products";
import type { Recipe } from "../src/shared/recipe";
import { DEFAULT_EDITOR_SETTINGS } from "../src/shared/settings";
import { emptyRecipe, recipeWithBefore } from "./helpers/recipe";

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

function media(
  id: string,
  duration: number,
  kind: Media["kind"] = "ugc",
): Media {
  return {
    id,
    kind,
    productId: kind === "broll" ? "p1" : null,
    path: `clips/2026-10/${id}.mp4`,
    thumbPath: `clips/2026-10/${id}.jpg`,
    filmstripPath: null,
    originalName: `${id}.mov`,
    duration,
    width: 1080,
    height: 1920,
    recordedAt: null,
    wasHdr: false,
    createdAt: "2026-10-17T00:00:00.000Z",
  };
}

let seq = 0;
function job(
  id: string,
  state: JobState,
  extra: Partial<JobInfo> = {},
): JobInfo {
  return {
    id,
    type: "importClip",
    label: id,
    state,
    percent: state === "done" ? 100 : 10,
    seq: ++seq,
    order: seq,
    updatedAt: "2026-10-17T00:00:00.000Z",
    ...extra,
  };
}
const doneJob = (id: string, mediaId: string) =>
  job(id, "done", { result: { mediaId } });

const file = (path = "/x/a.mov") => ({ path }) as unknown as File;

// A controllable stand-in for window.api.
function makeApi() {
  const state = {
    openDraft: null as string | null,
    videos: new Map<string, Video>(),
    media: new Map<string, Media>(),
    nextJob: 0,
    saves: [] as Recipe[],
    saveGate: null as Promise<void> | null,
    mediaGets: new Map<string, Promise<Media | null>>(),
    importHook: null as ((jobId: string) => void) | null,
    cancelled: [] as string[],
    openDraftWrites: [] as (string | null)[],
    byPaths: [] as { path: string; media: Media | null; fileExists: boolean }[],
  };
  const api = {
    files: {
      pathsFor: (files: { path: string }[]) => files.map((f) => f.path),
    },
    jobs: {
      cancel: vi.fn(async (id: string) => {
        state.cancelled.push(id);
        return true;
      }),
      list: vi.fn(async () => []),
      onEvent: vi.fn(() => () => undefined),
    },
    library: { mediaBaseUrl: vi.fn(async () => "http://127.0.0.1:1/m/t") },
    media: {
      importUgc: vi.fn(async () => {
        const id = `job-${++state.nextJob}`;
        state.importHook?.(id);
        return [id];
      }),
      get: vi.fn(async (id: string) =>
        state.mediaGets.has(id)
          ? state.mediaGets.get(id)!
          : (state.media.get(id) ?? null),
      ),
      byPaths: vi.fn(async () => state.byPaths),
    },
    products: {
      list: vi.fn(async () => [PRODUCT]),
      touchLastUsed: vi.fn(async () => ({ ok: true, value: PRODUCT })),
    },
    settings: {
      get: vi.fn(async () => DEFAULT_EDITOR_SETTINGS),
      getOpenDraft: vi.fn(async () => state.openDraft),
      setOpenDraft: vi.fn(async (id: string | null) => {
        state.openDraftWrites.push(id);
        state.openDraft = id;
      }),
    },
    videos: {
      saveDraft: vi.fn(async (recipe: Recipe) => {
        await state.saveGate;
        state.saves.push(recipe);
        state.videos.set(recipe.id, {
          id: recipe.id,
          productId: recipe.productId,
          status: "draft",
          recipeJson: JSON.stringify(recipe),
          exportPath: null,
          batchId: null,
          createdAt: "x",
          updatedAt: "y",
        });
        return { ok: true, value: { id: recipe.id, updatedAt: "y" } };
      }),
      get: vi.fn(async (id: string) => state.videos.get(id) ?? null),
    },
  };
  return { state, api };
}

let ctx: ReturnType<typeof makeApi>;

beforeEach(() => {
  ctx = makeApi();
  vi.stubGlobal("window", { api: ctx.api });
  useEditorStore.setState({
    draft: null,
    product: null,
    selectedSlot: null,
    slotMedia: {},
    pending: {},
    missing: {},
    slotError: {},
    notice: null,
    saveError: null,
    persisted: false,
    epoch: 0,
    switching: false,
  });
  useJobsStore.setState({ jobs: {} });
  useProductsStore.setState({
    products: [PRODUCT],
    loaded: true,
    mediaBase: null,
  });
  useSettingsStore.setState({
    settings: DEFAULT_EDITOR_SETTINGS,
    loaded: false,
  });
});

const editor = () => useEditorStore.getState();

async function startWithClip(
  slot: "before" | "after" = "before",
  seconds = 12,
) {
  ctx.state.media.set("m1", media("m1", seconds));
  await editor().startDraft(PRODUCT);
  await editor().importToSlot(slot, [file()]);
  await editor().handleJob(doneJob("job-1", "m1"));
  await editor().flush();
}

describe("startDraft", () => {
  it("creates an empty draft with the settings defaults and touches last-used", async () => {
    ctx.api.settings.get.mockResolvedValue({
      ...DEFAULT_EDITOR_SETTINGS,
      clipDurations: { before: 2, after: 2.5, broll: 6 },
    });
    await editor().startDraft(PRODUCT);
    const draft = editor().draft!;
    expect(draft.productId).toBe("p1");
    expect(draft.productSlug).toBe("p-one");
    expect(draft.clips.map((c) => c.duration)).toEqual([2, 2.5, 6]);
    expect(draft.clips.every((c) => c.mediaPath === "")).toBe(true);
    expect(ctx.api.products.touchLastUsed).toHaveBeenCalledWith("p1");
  });

  it("saves nothing until the first clip", async () => {
    await editor().startDraft(PRODUCT);
    await editor().flush();
    expect(ctx.api.videos.saveDraft).not.toHaveBeenCalled();
    expect(ctx.state.openDraftWrites).toEqual([]);
  });
});

describe("slot import", () => {
  it("sets the clip with a default trim, saves at once and records the open draft", async () => {
    await startWithClip("before", 12);
    const clip = editor().draft!.clips[0];
    expect(clip).toMatchObject({
      mediaPath: "clips/2026-10/m1.mp4",
      sourceDuration: 12,
      trimStart: 0,
      duration: 3,
    });
    expect(editor().pending).toEqual({});
    expect(ctx.state.saves).toHaveLength(1);
    expect(ctx.state.openDraftWrites).toEqual([editor().draft!.id]);
    expect(editor().persisted).toBe(true);
  });

  it("uses the whole clip when it is shorter than the slot default", async () => {
    await startWithClip("after", 1.5);
    expect(editor().draft!.clips[1].duration).toBe(1.5);
  });

  it("uses the first file of a multi-file drop and says so", async () => {
    await editor().startDraft(PRODUCT);
    await editor().importToSlot("before", [file("/x/a.mov"), file("/x/b.mov")]);
    expect(ctx.api.media.importUgc).toHaveBeenCalledWith(["/x/a.mov"]);
    expect(editor().notice).toBe("Only the first clip was used.");
  });

  it("rejects a non-video and a file with no path without importing", async () => {
    await editor().startDraft(PRODUCT);
    await editor().importToSlot("before", [file("/x/notes.txt")]);
    expect(editor().slotError.before).toMatch(/\.mp4/);
    await editor().importToSlot("after", [file("")]);
    expect(editor().slotError.after).toMatch(/not saved/);
    expect(ctx.api.media.importUgc).not.toHaveBeenCalled();
  });

  it("ignores a stale result when the slot was replaced mid-import", async () => {
    ctx.state.media.set("m2", media("m2", 9));
    await editor().startDraft(PRODUCT);
    await editor().importToSlot("before", [file()]); // job-1
    // job-1 finishes, but its media lookup is slow.
    let release!: (m: Media | null) => void;
    ctx.state.mediaGets.set(
      "m1",
      new Promise<Media | null>((resolve) => (release = resolve)),
    );
    const handling = editor().handleJob(doneJob("job-1", "m1"));
    // The user drops another file on the same slot: job-2 replaces job-1.
    await editor().importToSlot("before", [file("/x/b.mov")]);
    expect(editor().pending.before?.jobId).toBe("job-2");
    expect(ctx.state.cancelled).toContain("job-1");
    release(media("m1", 12));
    await handling;
    expect(editor().draft!.clips[0].mediaPath).toBe("");
    expect(editor().pending.before?.jobId).toBe("job-2");
    // job-2 then lands normally.
    await editor().handleJob(doneJob("job-2", "m2"));
    expect(editor().draft!.clips[0].mediaPath).toBe("clips/2026-10/m2.mp4");
  });

  it("ignores a result for a draft that was closed meanwhile", async () => {
    await editor().startDraft(PRODUCT);
    await editor().importToSlot("before", [file()]);
    let release!: (m: Media | null) => void;
    ctx.state.mediaGets.set(
      "m1",
      new Promise<Media | null>((resolve) => (release = resolve)),
    );
    const handling = editor().handleJob(doneJob("job-1", "m1"));
    await editor().closeDraft();
    release(media("m1", 12));
    await handling;
    expect(editor().draft).toBeNull();
    expect(ctx.api.videos.saveDraft).not.toHaveBeenCalled();
  });

  it("handles a job that finished before its id was mapped", async () => {
    ctx.state.media.set("m1", media("m1", 8));
    // The job is already done in the jobs store when importUgc resolves.
    ctx.state.importHook = (jobId) =>
      useJobsStore.getState().applyEvent({
        type: "done",
        job: doneJob(jobId, "m1"),
      });
    await editor().startDraft(PRODUCT);
    await editor().importToSlot("before", [file()]);
    await editor().flush();
    expect(editor().pending).toEqual({});
    expect(editor().draft!.clips[0].mediaPath).toBe("clips/2026-10/m1.mp4");
  });

  it("shows the job's error when the import failed", async () => {
    ctx.state.importHook = (jobId) =>
      useJobsStore.getState().applyEvent({
        type: "failed",
        job: job(jobId, "failed", { error: "Could not read the video." }),
      });
    await editor().startDraft(PRODUCT);
    await editor().importToSlot("before", [file()]);
    expect(editor().slotError.before).toBe("Could not read the video.");
    expect(editor().pending).toEqual({});
    expect(editor().draft!.clips[0].mediaPath).toBe("");
  });

  it("clears pending quietly when the job was cancelled", async () => {
    await editor().startDraft(PRODUCT);
    await editor().importToSlot("before", [file()]);
    await editor().handleJob(job("job-1", "cancelled"));
    expect(editor().pending).toEqual({});
    expect(editor().slotError).toEqual({});
  });

  it("reports an imported clip that cannot be found", async () => {
    await editor().startDraft(PRODUCT);
    await editor().importToSlot("before", [file()]);
    await editor().handleJob(doneJob("job-1", "ghost"));
    expect(editor().slotError.before).toMatch(/could not be found/);
    expect(editor().draft!.clips[0].mediaPath).toBe("");
  });
});

describe("b-roll and clearing", () => {
  it("sets b-roll and saves; clearing the only clip still saves", async () => {
    await editor().startDraft(PRODUCT);
    editor().setBroll(media("b1", 20, "broll"));
    await editor().flush();
    expect(editor().draft!.clips[2]).toMatchObject({
      mediaPath: "clips/2026-10/b1.mp4",
      duration: 5,
      muted: true,
    });
    expect(ctx.state.saves).toHaveLength(1);
    editor().clearSlot("broll");
    await editor().flush();
    expect(ctx.state.saves).toHaveLength(2);
    expect(ctx.state.saves[1].clips[2].mediaPath).toBe("");
  });

  it("ignores a non-b-roll media row", async () => {
    await editor().startDraft(PRODUCT);
    editor().setBroll(media("u1", 5, "ugc"));
    expect(editor().draft!.clips[2].mediaPath).toBe("");
  });
});

describe("closeDraft, openDraft, hydrate", () => {
  it("close cancels pending imports, saves, and clears the open draft", async () => {
    await startWithClip();
    await editor().importToSlot("after", [file("/x/b.mov")]); // job-2 pending
    const id = editor().draft!.id;
    await editor().closeDraft();
    expect(ctx.state.cancelled).toContain("job-2");
    expect(ctx.state.openDraft).toBeNull();
    expect(ctx.state.openDraftWrites.at(-1)).toBeNull();
    expect(editor().draft).toBeNull();
    expect(editor().pending).toEqual({});
    expect(ctx.state.videos.has(id)).toBe(true);
  });

  it("closing an untouched draft leaves nothing behind", async () => {
    await editor().startDraft(PRODUCT);
    await editor().closeDraft();
    expect(ctx.api.videos.saveDraft).not.toHaveBeenCalled();
    expect(ctx.state.openDraftWrites).toEqual([]);
  });

  it("hydrate restores only the open draft, refreshes the slug and flags missing clips", async () => {
    const recipe = recipeWithBefore({ id: "p1", slug: "old-slug" });
    ctx.state.videos.set(recipe.id, {
      id: recipe.id,
      productId: "p1",
      status: "draft",
      recipeJson: JSON.stringify(recipe),
      exportPath: null,
      batchId: null,
      createdAt: "x",
      updatedAt: "y",
    });
    ctx.state.openDraft = recipe.id;
    ctx.state.byPaths = [
      {
        path: "clips/2026-10/a.mp4",
        media: media("a", 8),
        fileExists: false,
      },
    ];
    expect(await editor().hydrate()).toBe(true);
    expect(editor().draft!.id).toBe(recipe.id);
    expect(editor().draft!.productSlug).toBe("p-one");
    expect(editor().missing.before).toBe(true);
    expect(editor().persisted).toBe(true);
  });

  it("hydrate does nothing when no draft was left open", async () => {
    const recipe = emptyRecipe();
    ctx.state.videos.set(recipe.id, {
      id: recipe.id,
      productId: "p1",
      status: "draft",
      recipeJson: JSON.stringify(recipe),
      exportPath: null,
      batchId: null,
      createdAt: "x",
      updatedAt: "y",
    });
    expect(await editor().hydrate()).toBe(false);
    expect(editor().draft).toBeNull();
  });

  it("hydrate forgets a pointer to a draft that is gone or exported", async () => {
    ctx.state.openDraft = "ghost";
    expect(await editor().hydrate()).toBe(false);
    expect(ctx.state.openDraft).toBeNull();

    const recipe = emptyRecipe();
    ctx.state.videos.set(recipe.id, {
      id: recipe.id,
      productId: "p1",
      status: "exported",
      recipeJson: JSON.stringify(recipe),
      exportPath: "x",
      batchId: null,
      createdAt: "x",
      updatedAt: "y",
    });
    ctx.state.openDraft = recipe.id;
    expect(await editor().hydrate()).toBe(false);
    expect(ctx.state.openDraft).toBeNull();
    expect(editor().draft).toBeNull();
  });
});

describe("library switch", () => {
  it("flushes the pending save into the old library, resets, and rehydrates the new one", async () => {
    await startWithClip();
    const draftA = editor().draft!.id;

    // A save is in flight (slow) when the user starts switching libraries.
    let openGate!: () => void;
    ctx.state.saveGate = new Promise<void>((resolve) => (openGate = resolve));
    editor().clearSlot("before");
    const before = editor().beforeLibrarySwitch();
    let flushed = false;
    void before.then(() => (flushed = true));
    await Promise.resolve();
    expect(flushed).toBe(false); // waiting for the save
    openGate();
    await before;
    expect(ctx.state.saves.at(-1)!.id).toBe(draftA);
    expect(ctx.state.saves.at(-1)!.clips[0].mediaPath).toBe("");
    expect(editor().switching).toBe(true);

    // Library B has its own open draft.
    const recipeB = recipeWithBefore({ id: "p1", slug: "p-one" });
    ctx.state.saveGate = null;
    const savesBefore = ctx.state.saves.length;
    ctx.state.videos = new Map([
      [
        recipeB.id,
        {
          id: recipeB.id,
          productId: "p1",
          status: "draft",
          recipeJson: JSON.stringify(recipeB),
          exportPath: null,
          batchId: null,
          createdAt: "x",
          updatedAt: "y",
        },
      ],
    ]);
    ctx.state.openDraft = recipeB.id;
    ctx.state.byPaths = [
      { path: "clips/2026-10/a.mp4", media: media("a", 8), fileExists: true },
    ];

    await editor().afterLibrarySwitch();
    expect(editor().epoch).toBe(1);
    expect(editor().switching).toBe(false);
    expect(editor().draft!.id).toBe(recipeB.id);
    expect(editor().pending).toEqual({});
    // Nothing from A was written after the switch began.
    expect(ctx.state.saves).toHaveLength(savesBefore);
  });

  it("drops edits and imports that arrive while switching", async () => {
    await startWithClip();
    await editor().beforeLibrarySwitch();
    const saves = ctx.state.saves.length;
    editor().setBroll(media("b1", 20, "broll"));
    await editor().flush();
    expect(ctx.state.saves).toHaveLength(saves);
    await editor().importToSlot("after", [file("/x/b.mov")]);
    expect(ctx.api.media.importUgc).toHaveBeenCalledTimes(1); // only the setup import
  });

  it("a late result from library A never lands in library B", async () => {
    ctx.state.media.set("m1", media("m1", 12));
    await editor().startDraft(PRODUCT);
    await editor().importToSlot("before", [file()]); // job-1 pending in A
    let release!: (m: Media | null) => void;
    ctx.state.mediaGets.set(
      "m1",
      new Promise<Media | null>((resolve) => (release = resolve)),
    );
    const late = editor().handleJob(doneJob("job-1", "m1"));

    await editor().beforeLibrarySwitch();
    await editor().afterLibrarySwitch(); // B has no open draft
    release(media("m1", 12));
    await late;
    await editor().flush();
    expect(editor().draft).toBeNull();
    expect(ctx.api.videos.saveDraft).not.toHaveBeenCalled();
  });

  it("a failed switch lets editing continue", async () => {
    await startWithClip();
    await editor().beforeLibrarySwitch();
    editor().abortLibrarySwitch();
    editor().setBroll(media("b1", 20, "broll"));
    await editor().flush();
    expect(ctx.state.saves.at(-1)!.clips[2].mediaPath).toBe(
      "clips/2026-10/b1.mp4",
    );
  });
});

describe("setTrim", () => {
  const lastSaved = () => ctx.state.saves.at(-1)!;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("changes the trim and clamps it to the clip", async () => {
    await startWithClip("before", 12);
    editor().setTrim("before", { start: 20, duration: 3 }, "none");
    expect(editor().draft!.clips[0]).toMatchObject({
      trimStart: 9,
      duration: 3,
    });
  });

  it("does nothing when the result equals the current trim", async () => {
    await startWithClip("before", 12);
    const before = editor().draft;
    const saves = ctx.state.saves.length;
    editor().setTrim("before", { start: 0, duration: 3 }, "now");
    editor().setTrim("before", { start: 0, duration: 3.0000001 }, "now");
    expect(editor().draft).toBe(before);
    await editor().flush();
    expect(ctx.state.saves).toHaveLength(saves);
  });

  it("ignores an empty slot", async () => {
    await editor().startDraft(PRODUCT);
    const before = editor().draft;
    editor().setTrim("after", { start: 1, duration: 2 }, "now");
    expect(editor().draft).toBe(before);
  });

  it("saves nothing during a drag and once when it finishes", async () => {
    await startWithClip("before", 12);
    vi.useFakeTimers();
    const saves = ctx.state.saves.length;
    for (let i = 1; i <= 20; i++) {
      editor().setTrim("before", { start: i * 0.1, duration: 3 }, "none");
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(ctx.state.saves).toHaveLength(saves);
    editor().finishTrim();
    await vi.advanceTimersByTimeAsync(0);
    await editor().flush();
    expect(ctx.state.saves).toHaveLength(saves + 1);
    expect(lastSaved().clips[0].trimStart).toBe(2);
    // A drag that changed nothing does not save.
    editor().finishTrim();
    await editor().flush();
    expect(ctx.state.saves).toHaveLength(saves + 1);
  });

  it("saves a burst of key nudges once, after the debounce", async () => {
    await startWithClip("before", 12);
    vi.useFakeTimers();
    const saves = ctx.state.saves.length;
    for (let i = 1; i <= 5; i++) {
      editor().setTrim("before", { start: i * 0.1, duration: 3 }, "debounced");
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(ctx.state.saves).toHaveLength(saves);
    await vi.advanceTimersByTimeAsync(TRIM_SAVE_DEBOUNCE_MS);
    await editor().flush();
    expect(ctx.state.saves).toHaveLength(saves + 1);
    expect(lastSaved().clips[0].trimStart).toBe(0.5);
  });

  it("a debounced trim followed by Remove within the window does not bring the clip back", async () => {
    await startWithClip("before", 12);
    vi.useFakeTimers();
    editor().setTrim("before", { start: 1, duration: 3 }, "debounced");
    editor().clearSlot("before");
    await vi.advanceTimersByTimeAsync(TRIM_SAVE_DEBOUNCE_MS * 3);
    await editor().flush();
    expect(lastSaved().clips[0].mediaPath).toBe("");
    // The cleared draft was saved once by clearSlot, never again by the timer.
    expect(
      ctx.state.saves.filter((recipe) => recipe.clips[0].mediaPath !== ""),
    ).toHaveLength(1);
    expect(editor().draft!.clips[0].mediaPath).toBe("");
  });

  it("saves the draft as it is when the timer fires, not as it was scheduled", async () => {
    await startWithClip("before", 12);
    vi.useFakeTimers();
    editor().setTrim("before", { start: 1, duration: 3 }, "debounced");
    editor().setTrim("before", { start: 2, duration: 3 }, "debounced");
    await vi.advanceTimersByTimeAsync(TRIM_SAVE_DEBOUNCE_MS);
    await editor().flush();
    expect(lastSaved().clips[0].trimStart).toBe(2);
  });

  it("flush saves a pending trim at once", async () => {
    await startWithClip("before", 12);
    vi.useFakeTimers();
    editor().setTrim("before", { start: 1, duration: 3 }, "debounced");
    await editor().flush();
    expect(lastSaved().clips[0].trimStart).toBe(1);
  });

  it("closing the draft saves a pending trim and drops the timer", async () => {
    await startWithClip("before", 12);
    vi.useFakeTimers();
    editor().setTrim("before", { start: 1, duration: 3 }, "debounced");
    await editor().closeDraft();
    expect(lastSaved().clips[0].trimStart).toBe(1);
    const saves = ctx.state.saves.length;
    await vi.advanceTimersByTimeAsync(TRIM_SAVE_DEBOUNCE_MS * 3);
    expect(ctx.state.saves).toHaveLength(saves);
  });

  it("a library switch saves a pending trim first", async () => {
    await startWithClip("before", 12);
    vi.useFakeTimers();
    editor().setTrim("before", { start: 1, duration: 3 }, "debounced");
    await editor().beforeLibrarySwitch();
    expect(lastSaved().clips[0].trimStart).toBe(1);
  });
});

describe("clip controls and captions", () => {
  const lastSaved = () => ctx.state.saves.at(-1)!;
  const bankCaption = (id = "c1") =>
    ({
      id,
      text: "{product} changed my whole wardrobe",
      slot: "before",
      productId: "p1",
    }) as unknown as import("../src/shared/library").Caption;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("zoom and mute save at once", async () => {
    await startWithClip("before", 12);
    const saves = ctx.state.saves.length;
    editor().setZoom("before", true);
    editor().setMuted("broll", false);
    await editor().flush();
    expect(ctx.state.saves).toHaveLength(saves + 2);
    expect(lastSaved().clips[0].zoom).toBe("slow-push");
    expect(lastSaved().clips[2].muted).toBe(false);
  });

  it("a pick stores the resolved text and its source, and touches no caption API", async () => {
    await startWithClip("before", 12);
    editor().pickCaption(
      "before",
      bankCaption(),
      "the 501s changed my wardrobe",
    );
    await editor().flush();
    expect(lastSaved().clips[0].caption).toEqual({
      text: "the 501s changed my wardrobe",
      sourceCaptionId: "c1",
      style: "outline",
      position: "middle",
    });
    expect(Object.keys(ctx.api)).not.toContain("captions");
  });

  it("typing updates the draft at once and saves once after the pause", async () => {
    await startWithClip("before", 12);
    vi.useFakeTimers();
    const saves = ctx.state.saves.length;
    for (const text of ["h", "he", "hel", "hello"]) {
      editor().setCaptionText("before", text);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(editor().draft!.clips[0].caption?.text).toBe("hello");
    expect(ctx.state.saves).toHaveLength(saves);
    await vi.advanceTimersByTimeAsync(TRIM_SAVE_DEBOUNCE_MS);
    await editor().flush();
    expect(ctx.state.saves).toHaveLength(saves + 1);
    expect(lastSaved().clips[0].caption?.text).toBe("hello");
  });

  it("type, then close within the debounce window keeps the text", async () => {
    await startWithClip("before", 12);
    vi.useFakeTimers();
    editor().setCaptionText("before", "do not lose me");
    await editor().closeDraft();
    expect(lastSaved().clips[0].caption?.text).toBe("do not lose me");
    const saves = ctx.state.saves.length;
    await vi.advanceTimersByTimeAsync(TRIM_SAVE_DEBOUNCE_MS * 3);
    expect(ctx.state.saves).toHaveLength(saves);
  });

  it("flush and a library switch save typed text first", async () => {
    await startWithClip("before", 12);
    vi.useFakeTimers();
    editor().setCaptionText("before", "one");
    await editor().flush();
    expect(lastSaved().clips[0].caption?.text).toBe("one");
    editor().setCaptionText("before", "two");
    await editor().beforeLibrarySwitch();
    expect(lastSaved().clips[0].caption?.text).toBe("two");
  });

  it("a click on a toggle right after typing saves the typed text too", async () => {
    await startWithClip("before", 12);
    vi.useFakeTimers();
    editor().setCaptionText("before", "typed");
    editor().setZoom("before", true);
    await editor().flush();
    expect(lastSaved().clips[0]).toMatchObject({
      zoom: "slow-push",
      caption: { text: "typed" },
    });
    const saves = ctx.state.saves.length;
    await vi.advanceTimersByTimeAsync(TRIM_SAVE_DEBOUNCE_MS * 3);
    expect(ctx.state.saves).toHaveLength(saves);
  });

  it("look, adopt and clear", async () => {
    await startWithClip("before", 12);
    editor().setCaptionLook("before", { style: "box" });
    expect(editor().draft!.clips[0].caption).toBeNull();
    editor().pickCaption("before", bankCaption(), "hi");
    editor().setCaptionLook("before", { style: "box", position: "top" });
    editor().adoptCaptionSource("before", "c2");
    expect(editor().draft!.clips[0].caption).toEqual({
      text: "hi",
      sourceCaptionId: "c2",
      style: "box",
      position: "top",
    });
    editor().clearCaption("before");
    await editor().flush();
    expect(lastSaved().clips[0].caption).toBeNull();
  });

  it("ignores edits while a library switch is under way", async () => {
    await startWithClip("before", 12);
    await editor().beforeLibrarySwitch();
    editor().setZoom("before", true);
    editor().setCaptionText("before", "late");
    expect(editor().draft!.clips[0].zoom).toBe("none");
    expect(editor().draft!.clips[0].caption).toBeNull();
  });
});
