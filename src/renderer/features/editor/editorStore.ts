import { create } from "zustand";
import { parseDraftRecipe, withProductSlug } from "../../../shared/drafts";
import { debounce } from "../../../shared/debounce";
import { exportBlocker } from "../../../shared/exportBlocker";
import {
  applyCaptionLook,
  applyCaptionPick,
  applyCaptionText,
  applyClipMedia,
  applyMuted,
  applySourceCaption,
  applyTrim,
  applyZoom,
  clearCaption,
  clearClip,
  draftHasMedia,
  type CaptionLook,
} from "../../../shared/editorRecipe";
import {
  hasImportExtension,
  importedMediaId,
  isExportJobResult,
  isTerminalJobState,
  type JobInfo,
} from "../../../shared/jobs";
import type { Caption, Media } from "../../../shared/library";
import { isUsableMedia } from "../../../shared/mediaLookup";
import type { ProductSummary } from "../../../shared/products";
import {
  createEmptyRecipe,
  SLOTS,
  type Recipe,
  type Slot,
} from "../../../shared/recipe";
import { clampTrim, sameTrim, type Trim } from "../../../shared/trimMath";
import { useJobsStore } from "../jobs/jobsStore";
import { useProductsStore } from "../products/productsStore";
import { useSettingsStore } from "../settings/settingsStore";

export type PendingImport = { jobId: string; name: string };

// Where an export stands. `starting` is the moment between the click and the job id: the
// draft is already locked then, like while `running`.
export type ExportState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running"; jobId: string }
  | {
      kind: "done";
      videoId: string;
      exportPath: string;
      fileName: string;
      warnings: string[];
    }
  | { kind: "failed"; message: string };

export const EXPORT_BUSY_MESSAGE =
  "An export is running. Wait for it to finish or cancel it first.";

export function isExportBusy(state: ExportState): boolean {
  return state.kind === "starting" || state.kind === "running";
}
type PerSlot<T> = Partial<Record<Slot, T>>;
type OpenResult = { ok: true } | { ok: false; message: string };

// How a trim change is saved: `none` while a pointer drag is under way (the drag's end
// saves once), `debounced` for held-key nudges, `now` for a finished edit.
export type TrimSave = "none" | "debounced" | "now";

// Held-key nudges and typing arrive faster than they are worth saving.
export const TRIM_SAVE_DEBOUNCE_MS = 300;

export type EditorStore = {
  // The recipe being edited; null = no draft open (New Video shows the product grid).
  draft: Recipe | null;
  product: ProductSummary | null;
  selectedSlot: Slot | null;
  // The media row behind each filled slot (thumbnail, original name).
  slotMedia: PerSlot<Media>;
  // UGC imports in flight, by slot.
  pending: PerSlot<PendingImport>;
  // Slots whose row or file is gone from the library.
  missing: PerSlot<true>;
  slotError: PerSlot<string>;
  notice: string | null;
  saveError: string | null;
  // The draft row exists in the database (the first clip has been saved).
  persisted: boolean;
  // Bumped by every library switch. Work started in one epoch never lands in the next.
  epoch: number;
  // True between beforeLibrarySwitch and its outcome: no saves, no imports.
  switching: boolean;
  exportState: ExportState;

  startDraft: (product: ProductSummary) => Promise<void>;
  openDraft: (id: string) => Promise<OpenResult>;
  closeDraft: () => Promise<void>;
  // Saves the draft and queues the render. Does nothing while the Export button is off.
  exportVideo: () => Promise<void>;
  // Stops a running export. The draft stays as it was.
  cancelExport: () => void;
  // Leaves the failed or cancelled export panel and goes back to editing.
  dismissExport: () => void;
  // Leaves the done panel: closes the exported draft WITHOUT saving it (it is a video now).
  finishExport: () => Promise<void>;
  // finishExport, then a fresh draft for the same product.
  newVideoSameProduct: () => Promise<void>;
  // Opens the draft that was open when the app last closed. true = restored.
  hydrate: () => Promise<boolean>;
  selectSlot: (slot: Slot | null) => void;
  importToSlot: (slot: Slot, files: File[]) => Promise<void>;
  // A job reached a terminal state; applies it if it belongs to a pending slot import.
  handleJob: (job: JobInfo) => Promise<void>;
  setBroll: (media: Media) => void;
  // Moves a slot's trim window (clamped to the clip). A change that leaves the trim as it
  // is does nothing at all: no new draft, no save.
  setTrim: (slot: Slot, trim: Trim, save: TrimSave) => void;
  // A drag ended: saves once if it changed anything.
  finishTrim: () => void;
  setZoom: (slot: Slot, on: boolean) => void;
  setMuted: (slot: Slot, muted: boolean) => void;
  // Picking from the bank: `text` is the token-resolved text. Remembers which caption it
  // started from; use_count is NOT touched here (export does that).
  pickCaption: (slot: Slot, caption: Caption, text: string) => void;
  // Typing in the caption box: updates at once, saves after a pause.
  setCaptionText: (slot: Slot, text: string) => void;
  setCaptionLook: (slot: Slot, look: Partial<CaptionLook>) => void;
  clearCaption: (slot: Slot) => void;
  // After "Save to bank": the caption now starts from the new bank row.
  adoptCaptionSource: (slot: Slot, captionId: string) => void;
  clearSlot: (slot: Slot) => void;
  dismissNotice: () => void;
  // Resolves when every queued save has finished.
  flush: () => Promise<void>;
  beforeLibrarySwitch: () => Promise<void>;
  abortLibrarySwitch: () => void;
  afterLibrarySwitch: () => Promise<void>;
};

const EMPTY = {
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
  exportState: { kind: "idle" },
} as const;

function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function withoutKey<T>(map: PerSlot<T>, slot: Slot): PerSlot<T> {
  const rest = { ...map };
  delete rest[slot];
  return rest;
}

// Saves go one at a time, in order, so a flush can wait for all of them.
let saveChain: Promise<void> = Promise.resolve();
// Job ids whose result is being applied right now (the jobs-store watcher and the
// immediate check after importUgc can both see the same finished job).
const handling = new Set<string>();

export const useEditorStore = create<EditorStore>((set, get) => {
  // True while the draft holds a trim or caption-text change that no save has been queued
  // for.
  let editDirty = false;

  // Saves the draft as it is NOW. The debounced save calls this when its timer fires, so
  // a recipe captured at schedule time can never overwrite a later change (a trim followed
  // by Remove within 300 ms must not bring the clip back).
  function saveEditNow(): void {
    editSave.cancel();
    const draft = get().draft;
    if (!editDirty || !draft) {
      return;
    }
    editDirty = false;
    if (get().persisted || draftHasMedia(draft)) {
      void queueSave(draft);
    }
  }
  const editSave = debounce(saveEditNow, TRIM_SAVE_DEBOUNCE_MS);

  function cancelJob(jobId: string): void {
    void window.api.jobs.cancel(jobId).catch(() => false);
  }

  function cancelAllPending(): void {
    for (const entry of Object.values(get().pending)) {
      if (entry) {
        cancelJob(entry.jobId);
      }
    }
    set({ pending: {} });
  }

  function slotOfJob(jobId: string): Slot | null {
    const pending = get().pending;
    return SLOTS.find((slot) => pending[slot]?.jobId === jobId) ?? null;
  }

  function failSlot(slot: Slot, message: string): void {
    set({
      pending: withoutKey(get().pending, slot),
      slotError: { ...get().slotError, [slot]: message },
    });
  }

  // Queues a save of `recipe`. Dropped when a library switch happened since it was queued
  // (or is under way): library A's draft must never be written into library B.
  function queueSave(recipe: Recipe): Promise<void> {
    const epoch = get().epoch;
    saveChain = saveChain.then(async () => {
      if (get().epoch !== epoch || get().switching) {
        return;
      }
      try {
        const result = await window.api.videos.saveDraft(recipe);
        if (get().epoch !== epoch) {
          return;
        }
        if (!result.ok) {
          set({ saveError: result.message });
          return;
        }
        set({ saveError: null });
        if (!get().persisted && get().draft?.id === recipe.id) {
          set({ persisted: true });
          await window.api.settings.setOpenDraft(recipe.id);
        }
      } catch (error) {
        set({ saveError: messageOf(error) });
      }
    });
    return saveChain;
  }

  // The draft is frozen from the click on Export until the export panel is left: the render
  // reads what was saved, and a finished export turns the row into a video.
  function editsLocked(): boolean {
    return get().exportState.kind !== "idle";
  }

  // Applies a recipe change and saves it at once: the first clip creates the draft row,
  // later changes (including emptying a slot) keep updating it.
  function commit(next: Recipe): void {
    if (editsLocked()) {
      return;
    }
    // This save carries the latest draft, trim edits included.
    editSave.cancel();
    editDirty = false;
    set({ draft: next });
    if (get().persisted || draftHasMedia(next)) {
      void queueSave(next);
    }
  }

  function applyMedia(slot: Slot, media: Media): void {
    const draft = get().draft;
    if (!draft) {
      return;
    }
    const { clipDurations } = useSettingsStore.getState().settings;
    const next = applyClipMedia(
      draft,
      slot,
      { path: media.path, duration: media.duration },
      clipDurations,
      new Date(),
    );
    set({
      slotMedia: { ...get().slotMedia, [slot]: media },
      missing: withoutKey(get().missing, slot),
      slotError: withoutKey(get().slotError, slot),
    });
    commit(next);
  }

  async function loadProduct(
    productId: string,
  ): Promise<ProductSummary | null> {
    const products = useProductsStore.getState();
    if (!products.products.some((p) => p.id === productId)) {
      await products.load();
    }
    return (
      useProductsStore.getState().products.find((p) => p.id === productId) ??
      null
    );
  }

  // The running export's job reached a terminal state.
  function applyExportJob(job: JobInfo): void {
    if (job.state === "cancelled") {
      set({ exportState: { kind: "idle" } });
      return;
    }
    if (job.state === "failed") {
      set({
        exportState: {
          kind: "failed",
          message: job.error ?? "The export failed.",
        },
      });
      return;
    }
    if (job.state === "done" && isExportJobResult(job.result)) {
      const { videoId, exportPath, warnings } = job.result;
      set({
        exportState: {
          kind: "done",
          videoId,
          exportPath,
          fileName: exportPath.split("/").pop() ?? exportPath,
          warnings,
        },
      });
      // The row is a video now; a restart must not try to reopen it as a draft.
      void window.api.settings.setOpenDraft(null).catch(() => undefined);
      return;
    }
    set({
      exportState: { kind: "failed", message: "The export did not finish." },
    });
  }

  return {
    ...EMPTY,
    epoch: 0,
    switching: false,

    async startDraft(product) {
      if (isExportBusy(get().exportState)) {
        set({ notice: EXPORT_BUSY_MESSAGE });
        return;
      }
      if (get().draft) {
        await get().closeDraft();
      }
      const epoch = get().epoch;
      const settings = await useSettingsStore.getState().load();
      if (get().epoch !== epoch || get().draft) {
        return;
      }
      const draft = createEmptyRecipe(
        { id: product.id, slug: product.slug },
        { clipDurations: settings.clipDurations },
        { id: crypto.randomUUID(), now: new Date() },
      );
      set({ ...EMPTY, draft, product });
      // Sorts this product first next time. Never blocks editing.
      void useProductsStore
        .getState()
        .touchLastUsed(product.id)
        .catch(() => undefined);
    },

    async openDraft(id) {
      if (isExportBusy(get().exportState)) {
        return { ok: false, message: EXPORT_BUSY_MESSAGE };
      }
      if (get().draft?.id === id) {
        return { ok: true };
      }
      const epoch = get().epoch;
      try {
        const video = await window.api.videos.get(id);
        // A failed export opens like a draft; the next save makes it one again.
        if (!video || video.status === "exported") {
          return { ok: false, message: "That draft no longer exists." };
        }
        const parsed = parseDraftRecipe(video.recipeJson);
        if (!parsed) {
          return { ok: false, message: "That draft could not be read." };
        }
        const product = await loadProduct(parsed.productId);
        if (!product) {
          return {
            ok: false,
            message: "That draft's product no longer exists.",
          };
        }
        // The slug is editable, so take the current one (export must too, DECISIONS #33).
        const recipe = withProductSlug(parsed, product.slug);
        const paths = recipe.clips
          .map((clip) => clip.mediaPath)
          .filter((p) => p !== "");
        const checks = paths.length
          ? await window.api.media.byPaths(paths)
          : [];
        await useSettingsStore.getState().load();
        if (get().epoch !== epoch) {
          return { ok: false, message: "The library changed." };
        }
        // Leave the draft that is open now.
        if (get().draft) {
          await get().closeDraft();
        }
        const slotMedia: PerSlot<Media> = {};
        const missing: PerSlot<true> = {};
        for (const clip of recipe.clips) {
          if (clip.mediaPath === "") {
            continue;
          }
          const check = checks.find((c) => c.path === clip.mediaPath);
          if (check?.media) {
            slotMedia[clip.slot] = check.media;
          }
          if (!check || !isUsableMedia(check)) {
            missing[clip.slot] = true;
          }
        }
        set({
          ...EMPTY,
          draft: recipe,
          product,
          slotMedia,
          missing,
          persisted: true,
        });
        await window.api.settings.setOpenDraft(recipe.id);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageOf(error) };
      }
    },

    async closeDraft() {
      const exporting = get().exportState;
      if (isExportBusy(exporting)) {
        set({ notice: EXPORT_BUSY_MESSAGE });
        return;
      }
      if (exporting.kind === "done") {
        // The draft became a video: saving it would only fail.
        await get().finishExport();
        return;
      }
      cancelAllPending();
      // The save below carries any trim change.
      editSave.cancel();
      editDirty = false;
      const draft = get().draft;
      if (draft && (get().persisted || draftHasMedia(draft))) {
        await queueSave(draft);
      }
      await saveChain;
      if (get().persisted) {
        await window.api.settings.setOpenDraft(null).catch(() => undefined);
      }
      set({ ...EMPTY });
    },

    async hydrate() {
      const epoch = get().epoch;
      try {
        await useSettingsStore.getState().load();
        const openId = await window.api.settings.getOpenDraft();
        if (!openId || get().epoch !== epoch || get().draft) {
          return false;
        }
        const result = await get().openDraft(openId);
        if (!result.ok) {
          // The row is gone, exported or unreadable: forget the pointer.
          await window.api.settings.setOpenDraft(null).catch(() => undefined);
        }
        return result.ok;
      } catch {
        return false;
      }
    },

    async exportVideo() {
      const { draft, product, pending, missing } = get();
      if (!draft || !product || get().switching) {
        return;
      }
      if (get().exportState.kind !== "idle") {
        return;
      }
      const blocker = exportBlocker({
        draft,
        pendingSlots: SLOTS.filter((slot) => pending[slot]),
        missingSlots: SLOTS.filter((slot) => missing[slot]),
      });
      if (blocker) {
        set({ notice: blocker });
        return;
      }
      // Locks the editor before anything is awaited.
      set({ exportState: { kind: "starting" }, notice: null });
      const epoch = get().epoch;
      try {
        await get().flush();
        const latest = get().draft;
        if (get().epoch !== epoch || !latest) {
          return;
        }
        const result = await window.api.videos.export(latest);
        if (get().epoch !== epoch) {
          return;
        }
        if (!result.ok) {
          set({ exportState: { kind: "failed", message: result.message } });
          return;
        }
        const { jobId } = result.value;
        set({ exportState: { kind: "running", jobId }, persisted: true });
        // The job may have finished before we knew its id.
        const job = useJobsStore.getState().jobs[jobId];
        if (job && isTerminalJobState(job.state)) {
          applyExportJob(job);
        }
      } catch (error) {
        if (get().epoch === epoch) {
          set({ exportState: { kind: "failed", message: messageOf(error) } });
        }
      }
    },

    cancelExport() {
      const exporting = get().exportState;
      if (exporting.kind === "running") {
        cancelJob(exporting.jobId);
      }
    },

    dismissExport() {
      const exporting = get().exportState;
      if (exporting.kind === "failed") {
        set({ exportState: { kind: "idle" } });
      }
    },

    async finishExport() {
      const exporting = get().exportState;
      if (exporting.kind !== "done") {
        return;
      }
      editSave.cancel();
      editDirty = false;
      await saveChain;
      await window.api.settings.setOpenDraft(null).catch(() => undefined);
      set({ ...EMPTY });
    },

    async newVideoSameProduct() {
      const product = get().product;
      await get().finishExport();
      if (product && get().exportState.kind === "idle" && !get().draft) {
        await get().startDraft(product);
      }
    },

    selectSlot(slot) {
      set({ selectedSlot: slot });
    },

    async importToSlot(slot, files) {
      const draft = get().draft;
      if (!draft || get().switching || editsLocked() || files.length === 0) {
        return;
      }
      set({
        notice: files.length > 1 ? "Only the first clip was used." : null,
        slotError: withoutKey(get().slotError, slot),
      });
      const [filePath] = window.api.files.pathsFor([files[0]]);
      if (!filePath) {
        failSlot(slot, "That file is not saved on this computer.");
        return;
      }
      if (!hasImportExtension(filePath)) {
        failSlot(slot, "Choose an .mp4, .mov or .m4v video.");
        return;
      }
      // A newer drop replaces an import still running for this slot.
      const previous = get().pending[slot];
      if (previous) {
        cancelJob(previous.jobId);
      }
      const epoch = get().epoch;
      try {
        const [jobId] = await window.api.media.importUgc([filePath]);
        if (get().epoch !== epoch || get().draft?.id !== draft.id) {
          // The draft was closed or the library switched while we waited.
          cancelJob(jobId);
          return;
        }
        const name = filePath.split(/[\\/]/).pop() ?? filePath;
        set({ pending: { ...get().pending, [slot]: { jobId, name } } });
        // The job may have finished before we knew its id.
        const job = useJobsStore.getState().jobs[jobId];
        if (job && isTerminalJobState(job.state)) {
          await get().handleJob(job);
        }
      } catch (error) {
        failSlot(slot, messageOf(error));
      }
    },

    async handleJob(job) {
      if (!isTerminalJobState(job.state) || handling.has(job.id)) {
        return;
      }
      const exporting = get().exportState;
      if (exporting.kind === "running" && exporting.jobId === job.id) {
        applyExportJob(job);
        return;
      }
      const slot = slotOfJob(job.id);
      const draftId = get().draft?.id;
      if (!slot || !draftId) {
        return;
      }
      if (job.state === "cancelled") {
        set({ pending: withoutKey(get().pending, slot) });
        return;
      }
      if (job.state === "failed") {
        failSlot(slot, job.error ?? "Import failed.");
        return;
      }
      // done: fetch the row, then apply only if nothing changed in the meantime.
      handling.add(job.id);
      const epoch = get().epoch;
      try {
        const mediaId = importedMediaId(job.result);
        const media = mediaId ? await window.api.media.get(mediaId) : null;
        const stale =
          get().epoch !== epoch ||
          get().draft?.id !== draftId ||
          get().pending[slot]?.jobId !== job.id;
        if (stale) {
          return;
        }
        if (!media) {
          failSlot(slot, "The imported clip could not be found.");
          return;
        }
        applyMedia(slot, media);
        set({ pending: withoutKey(get().pending, slot) });
      } catch (error) {
        if (get().pending[slot]?.jobId === job.id) {
          failSlot(slot, messageOf(error));
        }
      } finally {
        handling.delete(job.id);
      }
    },

    setBroll(media) {
      if (media.kind !== "broll" || !get().draft) {
        return;
      }
      applyMedia("broll", media);
    },

    setTrim(slot, trim, save) {
      const draft = get().draft;
      const clip = draft?.clips[SLOTS.indexOf(slot)];
      if (
        !draft ||
        !clip ||
        editsLocked() ||
        clip.mediaPath === "" ||
        !(clip.sourceDuration > 0)
      ) {
        return;
      }
      const next = clampTrim(trim, clip.sourceDuration);
      if (sameTrim(next, { start: clip.trimStart, duration: clip.duration })) {
        return;
      }
      set({ draft: applyTrim(draft, slot, next, new Date()) });
      editDirty = true;
      if (save === "now") {
        saveEditNow();
      } else if (save === "debounced") {
        editSave();
      }
    },

    finishTrim() {
      saveEditNow();
    },

    setZoom(slot, on) {
      const draft = get().draft;
      if (draft && !get().switching) {
        commit(applyZoom(draft, slot, on, new Date()));
      }
    },

    setMuted(slot, muted) {
      const draft = get().draft;
      if (draft && !get().switching) {
        commit(applyMuted(draft, slot, muted, new Date()));
      }
    },

    pickCaption(slot, caption, text) {
      const draft = get().draft;
      if (draft && !get().switching) {
        commit(
          applyCaptionPick(
            draft,
            slot,
            { text, sourceCaptionId: caption.id },
            new Date(),
          ),
        );
      }
    },

    setCaptionText(slot, text) {
      const draft = get().draft;
      const clip = draft?.clips[SLOTS.indexOf(slot)];
      if (
        !draft ||
        !clip ||
        get().switching ||
        editsLocked() ||
        clip.caption?.text === text
      ) {
        return;
      }
      set({ draft: applyCaptionText(draft, slot, text, new Date()) });
      editDirty = true;
      editSave();
    },

    setCaptionLook(slot, look) {
      const draft = get().draft;
      if (draft && !get().switching) {
        const next = applyCaptionLook(draft, slot, look, new Date());
        if (next !== draft) {
          commit(next);
        }
      }
    },

    clearCaption(slot) {
      const draft = get().draft;
      if (draft && !get().switching) {
        commit(clearCaption(draft, slot, new Date()));
      }
    },

    adoptCaptionSource(slot, captionId) {
      const draft = get().draft;
      if (draft && !get().switching) {
        const next = applySourceCaption(draft, slot, captionId, new Date());
        if (next !== draft) {
          commit(next);
        }
      }
    },

    clearSlot(slot) {
      const draft = get().draft;
      if (!draft || editsLocked()) {
        return;
      }
      const previous = get().pending[slot];
      if (previous) {
        cancelJob(previous.jobId);
      }
      const { clipDurations } = useSettingsStore.getState().settings;
      set({
        pending: withoutKey(get().pending, slot),
        slotMedia: withoutKey(get().slotMedia, slot),
        missing: withoutKey(get().missing, slot),
        slotError: withoutKey(get().slotError, slot),
      });
      commit(clearClip(draft, slot, clipDurations, new Date()));
    },

    dismissNotice() {
      set({ notice: null });
    },

    async flush() {
      saveEditNow();
      await saveChain;
    },

    async beforeLibrarySwitch() {
      saveEditNow();
      await saveChain;
      set({ switching: true });
    },

    abortLibrarySwitch() {
      set({ switching: false });
    },

    async afterLibrarySwitch() {
      // Main cancelled the old library's jobs; forget them here and start clean, then
      // look for a draft that was open in the new library.
      handling.clear();
      editSave.cancel();
      editDirty = false;
      set({ ...EMPTY, epoch: get().epoch + 1, switching: false });
      useSettingsStore.setState({ loaded: false });
      await get().hydrate();
    },
  };
});

// Starts the editor's background work for the app's lifetime: finished imports land in
// their slots and the open draft is restored. Returns a cleanup function.
export function startEditor(onRestored?: () => void): () => void {
  const unsubscribe = useJobsStore.subscribe((state, previous) => {
    for (const job of Object.values(state.jobs)) {
      if (previous.jobs[job.id]?.state !== job.state) {
        void useEditorStore.getState().handleJob(job);
      }
    }
  });
  // Best effort only: a quit closes the database synchronously, so an invoke that has not
  // finished by then is lost (DECISIONS #33). Completed actions are already saved.
  const onPageHide = () => void useEditorStore.getState().flush();
  window.addEventListener("pagehide", onPageHide);
  void useEditorStore
    .getState()
    .hydrate()
    .then((restored) => {
      if (restored) {
        onRestored?.();
      }
    });
  return () => {
    unsubscribe();
    window.removeEventListener("pagehide", onPageHide);
  };
}
