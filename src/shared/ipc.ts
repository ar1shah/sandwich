// IPC contract shared by main, preload and renderer. Types and constants only.
import type {
  LibraryActivateOptions,
  LibraryCandidate,
  LibraryChooseSource,
  Caption,
  LibraryState,
  Media,
} from "./library";
import type { BrollResult } from "./broll";
import type {
  BulkAddCaptionsInput,
  CaptionResult,
  CreateCaptionInput,
  UpdateCaptionInput,
} from "./captions";
import type { JobEvent, JobInfo } from "./jobs";
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
