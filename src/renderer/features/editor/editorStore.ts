import { create } from "zustand";
import { parseDraftRecipe, withProductSlug } from "../../../shared/drafts";
import {
  applyClipMedia,
  clearClip,
  draftHasMedia,
} from "../../../shared/editorRecipe";
import {
  hasImportExtension,
  isTerminalJobState,
  type JobInfo,
} from "../../../shared/jobs";
import type { Media } from "../../../shared/library";
import { isUsableMedia } from "../../../shared/mediaLookup";
import type { ProductSummary } from "../../../shared/products";
import {
  createEmptyRecipe,
  SLOTS,
  type Recipe,
  type Slot,
} from "../../../shared/recipe";
import { useJobsStore } from "../jobs/jobsStore";
import { useProductsStore } from "../products/productsStore";
import { useSettingsStore } from "../settings/settingsStore";

export type PendingImport = { jobId: string; name: string };
type PerSlot<T> = Partial<Record<Slot, T>>;
type OpenResult = { ok: true } | { ok: false; message: string };

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

  startDraft: (product: ProductSummary) => Promise<void>;
  openDraft: (id: string) => Promise<OpenResult>;
  closeDraft: () => Promise<void>;
  // Opens the draft that was open when the app last closed. true = restored.
  hydrate: () => Promise<boolean>;
  selectSlot: (slot: Slot | null) => void;
  importToSlot: (slot: Slot, files: File[]) => Promise<void>;
  // A job reached a terminal state; applies it if it belongs to a pending slot import.
  handleJob: (job: JobInfo) => Promise<void>;
  setBroll: (media: Media) => void;
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

  // Applies a recipe change and saves it at once: the first clip creates the draft row,
  // later changes (including emptying a slot) keep updating it.
  function commit(next: Recipe): void {
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

  return {
    ...EMPTY,
    epoch: 0,
    switching: false,

    async startDraft(product) {
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
      if (get().draft?.id === id) {
        return { ok: true };
      }
      const epoch = get().epoch;
      try {
        const video = await window.api.videos.get(id);
        if (!video || video.status !== "draft") {
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
      cancelAllPending();
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

    selectSlot(slot) {
      set({ selectedSlot: slot });
    },

    async importToSlot(slot, files) {
      const draft = get().draft;
      if (!draft || get().switching || files.length === 0) {
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
        const mediaId = job.result?.mediaId;
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

    clearSlot(slot) {
      const draft = get().draft;
      if (!draft) {
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
      await saveChain;
    },

    async beforeLibrarySwitch() {
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
