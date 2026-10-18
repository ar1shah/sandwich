// IPC contract shared by main, preload and renderer. Types and constants only.
import type {
  LibraryActivateOptions,
  LibraryCandidate,
  LibraryChooseSource,
  Caption,
  LibraryState,
  Media,
  Video,
  VideoStatus,
} from "./library";
import type { BrollResult } from "./broll";
import type {
  BulkAddCaptionsInput,
  CaptionResult,
  CreateCaptionInput,
  UpdateCaptionInput,
} from "./captions";
import type { JobEvent, JobInfo } from "./jobs";
import type { MediaPathCheck } from "./mediaLookup";
import type { EditorSettings, UpdateEditorSettings } from "./settings";
import type { Recipe } from "./recipe";
import type { ExportStarted, SavedDraft, VideoResult } from "./videos";
import type {
  CreateProductRequest,
  ProductResult,
  ProductSummary,
  UpdateProductRequest,
} from "./products";

export const APP_VERSION_CHANNEL = "app:version";
export const LIBRARY_MEDIA_BASE_URL_CHANNEL = "library:mediaBaseUrl";
export const LIBRARY_GET_CHANNEL = "library:get";
export const LIBRARY_CHOOSE_CHANNEL = "library:choose";
export const LIBRARY_ACTIVATE_CHANNEL = "library:activate";
export const JOBS_LIST_CHANNEL = "jobs:list";
export const JOBS_CANCEL_CHANNEL = "jobs:cancel";
export const MEDIA_IMPORT_UGC_CHANNEL = "media:importUgc";
export const MEDIA_GET_CHANNEL = "media:get";
export const MEDIA_BY_PATHS_CHANNEL = "media:byPaths";
export const SETTINGS_GET_CHANNEL = "settings:get";
export const SETTINGS_UPDATE_CHANNEL = "settings:update";
export const SETTINGS_GET_OPEN_DRAFT_CHANNEL = "settings:getOpenDraft";
export const SETTINGS_SET_OPEN_DRAFT_CHANNEL = "settings:setOpenDraft";
export const VIDEOS_SAVE_DRAFT_CHANNEL = "videos:saveDraft";
export const VIDEOS_LIST_CHANNEL = "videos:list";
export const VIDEOS_GET_CHANNEL = "videos:get";
export const VIDEOS_REMOVE_CHANNEL = "videos:remove";
export const VIDEOS_EXPORT_CHANNEL = "videos:export";
export const VIDEOS_REVEAL_CHANNEL = "videos:reveal";
export const BROLL_LIST_CHANNEL = "broll:list";
export const BROLL_IMPORT_CHANNEL = "broll:import";
export const BROLL_REMOVE_CHANNEL = "broll:remove";
export const CAPTIONS_LIST_CHANNEL = "captions:list";
export const CAPTIONS_CREATE_CHANNEL = "captions:create";
export const CAPTIONS_UPDATE_CHANNEL = "captions:update";
export const CAPTIONS_REMOVE_CHANNEL = "captions:remove";
export const CAPTIONS_BULK_ADD_CHANNEL = "captions:bulkAdd";
export const PRODUCTS_LIST_CHANNEL = "products:list";
export const PRODUCTS_CREATE_CHANNEL = "products:create";
export const PRODUCTS_UPDATE_CHANNEL = "products:update";
export const PRODUCTS_REMOVE_CHANNEL = "products:remove";
export const PRODUCTS_ARCHIVE_CHANNEL = "products:archive";
export const PRODUCTS_TOUCH_CHANNEL = "products:touchLastUsed";
// Main -> renderer. One channel for every job state change and progress tick.
export const JOB_EVENT_CHANNEL = "job:event";
// Dev builds only (handler not registered when packaged).
export const DEV_IMPORT_FIXTURES_CHANNEL = "dev:importFixtures";

export type SandwichApi = {
  // process.platform of the app ("darwin", "win32", ...), for wording only ("Show in Finder"
  // or "Show in Explorer").
  platform: string;
  app: {
    version: () => Promise<string>;
  };
  library: {
    get: () => Promise<LibraryState>;
    // Opens the folder dialog ("dialog") or proposes the default folder ("default").
    // No side effects: main holds the candidate until activate(). null = cancelled.
    choose: (source: LibraryChooseSource) => Promise<LibraryCandidate | null>;
    // Opens the candidate main holds, saves it as the library and switches the media root.
    activate: (options?: LibraryActivateOptions) => Promise<LibraryState>;
    // http://127.0.0.1:<port>/m/<token>; build file URLs with mediaUrl(base, relPath).
    mediaBaseUrl: () => Promise<string>;
  };
  files: {
    // Absolute disk paths of File objects from a drop or file input (Electron 40 removed
    // File.path). Same order as the input; "" for a file that has no path on disk.
    pathsFor: (files: File[]) => string[];
  };
  jobs: {
    // Active jobs plus the most recent finished ones. Events may arrive before or after
    // this resolves: merge by job id and keep the higher `seq`.
    list: () => Promise<JobInfo[]>;
    // false = unknown or already finished.
    cancel: (jobId: string) => Promise<boolean>;
    // Returns an unsubscribe function.
    onEvent: (callback: (event: JobEvent) => void) => () => void;
  };
  media: {
    // Queues one importClip job per file (mp4, mov, m4v; any letter case). Returns job ids.
    importUgc: (filePaths: string[]) => Promise<string[]>;
    // One media row (null = gone). How a finished import job becomes a clip.
    get: (id: string) => Promise<Media | null>;
    // For each library-relative path: its row (if any) and whether the file is on disk.
    // Same order as the input. Drives the "Clip missing" state of a restored draft.
    byPaths: (paths: string[]) => Promise<MediaPathCheck[]>;
  };
  settings: {
    // Defaults filled in for anything the user never changed.
    get: () => Promise<EditorSettings>;
    // Editor fields only (clip lengths, target range); libraryPath is never accepted.
    // { ok: false } carries the first validation message.
    update: (
      patch: UpdateEditorSettings,
    ) => Promise<
      { ok: true; value: EditorSettings } | { ok: false; message: string }
    >;
    // The draft the editor has open in the current library (null = none). Main keys it by
    // the active library root, so the renderer never names a path.
    getOpenDraft: () => Promise<string | null>;
    setOpenDraft: (draftId: string | null) => Promise<void>;
  };
  videos: {
    // Insert or update a draft by recipe.id. { ok: false } = invalid recipe, product gone
    // or archived (new drafts only), or the video is already exported.
    saveDraft: (recipe: Recipe) => Promise<VideoResult<SavedDraft>>;
    // Newest-updated first. Rows carry the raw recipe JSON; use summarizeDraft/parseDraftRecipe.
    list: (options?: { status?: VideoStatus }) => Promise<Video[]>;
    get: (id: string) => Promise<Video | null>;
    // Drafts (and failed exports) only.
    remove: (id: string) => Promise<VideoResult<true>>;
    // Saves the draft, then queues a render job. Progress and the result come on
    // jobs.onEvent (type "render"; result is an ExportJobResult). { ok: false } = invalid
    // recipe, a slot without a clip, already exporting, or the product is gone.
    export: (recipe: Recipe) => Promise<VideoResult<ExportStarted>>;
    // Opens the exported file in Finder / Explorer. Main resolves the path from the row.
    reveal: (id: string) => Promise<VideoResult<true>>;
  };
  broll: {
    // The product's b-roll, newest first.
    list: (productId: string) => Promise<Media[]>;
    // Queues one import job per file into this product's library. Returns the job ids.
    // { ok: false } = the product is gone or archived. Progress comes on jobs.onEvent
    // (each job carries the productId).
    import: (
      productId: string,
      filePaths: string[],
    ) => Promise<BrollResult<string[]>>;
    // Deletes the row and its files (video, thumbnail, filmstrip).
    remove: (id: string) => Promise<BrollResult<true>>;
  };
  products: {
    // Every product, archived ones included (their slugs still count), with the counts the
    // delete dialog shows. Newest-used first; the UI re-sorts and filters.
    list: () => Promise<ProductSummary[]>;
    // Failures the user can fix (taken slug, unreadable image) come back as { ok: false }
    // with the form field to show them under; only bugs reject.
    create: (
      input: CreateProductRequest,
    ) => Promise<ProductResult<ProductSummary>>;
    update: (
      input: UpdateProductRequest,
    ) => Promise<ProductResult<ProductSummary>>;
    // Hard delete. { ok: false, code: "has-videos" } means archive it instead.
    remove: (id: string) => Promise<ProductResult<true>>;
    archive: (id: string) => Promise<ProductResult<ProductSummary>>;
    // Call when a product is picked for a video, so it sorts first next time.
    touchLastUsed: (id: string) => Promise<ProductResult<ProductSummary>>;
  };
  captions: {
    // The whole bank, oldest first. Filtering and search happen in the renderer.
    list: () => Promise<Caption[]>;
    // Failures the user can fix (product gone or archived) come back as { ok: false };
    // only bugs reject.
    create: (input: CreateCaptionInput) => Promise<CaptionResult<Caption>>;
    // Editing text or slot works even when the caption's product is archived; moving a
    // caption to an archived or missing product does not.
    update: (input: UpdateCaptionInput) => Promise<CaptionResult<Caption>>;
    remove: (id: string) => Promise<CaptionResult<true>>;
    // All or nothing, in one transaction, with one shared timestamp so the list keeps the
    // pasted order.
    bulkAdd: (input: BulkAddCaptionsInput) => Promise<CaptionResult<Caption[]>>;
  };
  dev: {
    // Queues every clip in the project's fixtures/ folder. Rejects in packaged builds.
    importFixtures: () => Promise<string[]>;
  };
};
