import {
  contextBridge,
  ipcRenderer,
  webUtils,
  type IpcRendererEvent,
} from "electron";
import type { BrollResult } from "../shared/broll";
import type { JobEvent, JobInfo } from "../shared/jobs";
import type {
  Caption,
  LibraryCandidate,
  LibraryState,
  Media,
  Video,
} from "../shared/library";
import type { CaptionResult } from "../shared/captions";
import type { ProductResult, ProductSummary } from "../shared/products";
import type { MediaPathCheck } from "../shared/mediaLookup";
import type { Recipe } from "../shared/recipe";
import type { EditorSettings } from "../shared/settings";
import type {
  ExportFileState,
  ExportStarted,
  RemovedVideo,
  SavedDraft,
  VideoResult,
} from "../shared/videos";
import {
  APP_VERSION_CHANNEL,
  BROLL_IMPORT_CHANNEL,
  BROLL_LIST_CHANNEL,
  BROLL_REMOVE_CHANNEL,
  CAPTIONS_BULK_ADD_CHANNEL,
  CAPTIONS_CREATE_CHANNEL,
  CAPTIONS_LIST_CHANNEL,
  CAPTIONS_REMOVE_CHANNEL,
  CAPTIONS_UPDATE_CHANNEL,
  DEV_IMPORT_FIXTURES_CHANNEL,
  JOB_EVENT_CHANNEL,
  JOBS_CANCEL_CHANNEL,
  JOBS_LIST_CHANNEL,
  MEDIA_BY_PATHS_CHANNEL,
  MEDIA_GET_CHANNEL,
  MEDIA_IMPORT_UGC_CHANNEL,
  SETTINGS_GET_CHANNEL,
  SETTINGS_GET_OPEN_DRAFT_CHANNEL,
  SETTINGS_SET_OPEN_DRAFT_CHANNEL,
  SETTINGS_UPDATE_CHANNEL,
  VIDEOS_GET_CHANNEL,
  VIDEOS_LIST_CHANNEL,
  VIDEOS_EXPORT_CHANNEL,
  VIDEOS_EXPORT_FILES_CHANNEL,
  VIDEOS_REMOVE_CHANNEL,
  VIDEOS_REVEAL_CHANNEL,
  VIDEOS_SAVE_DRAFT_CHANNEL,
  PRODUCTS_ARCHIVE_CHANNEL,
  PRODUCTS_CREATE_CHANNEL,
  PRODUCTS_LIST_CHANNEL,
  PRODUCTS_REMOVE_CHANNEL,
  PRODUCTS_TOUCH_CHANNEL,
  PRODUCTS_UPDATE_CHANNEL,
  LIBRARY_ACTIVATE_CHANNEL,
  LIBRARY_CHOOSE_CHANNEL,
  LIBRARY_GET_CHANNEL,
  LIBRARY_MEDIA_BASE_URL_CHANNEL,
  type SandwichApi,
} from "../shared/ipc";

const api: SandwichApi = {
  platform: process.platform,
  app: {
    version: () => ipcRenderer.invoke(APP_VERSION_CHANNEL) as Promise<string>,
  },
  library: {
    get: () => ipcRenderer.invoke(LIBRARY_GET_CHANNEL) as Promise<LibraryState>,
    choose: (source) =>
      ipcRenderer.invoke(
        LIBRARY_CHOOSE_CHANNEL,
        source,
      ) as Promise<LibraryCandidate | null>,
    activate: (options) =>
      ipcRenderer.invoke(
        LIBRARY_ACTIVATE_CHANNEL,
        options,
      ) as Promise<LibraryState>,
    mediaBaseUrl: () =>
      ipcRenderer.invoke(LIBRARY_MEDIA_BASE_URL_CHANNEL) as Promise<string>,
  },
  files: {
    pathsFor: (files) => files.map((file) => webUtils.getPathForFile(file)),
  },
  jobs: {
    list: () => ipcRenderer.invoke(JOBS_LIST_CHANNEL) as Promise<JobInfo[]>,
    cancel: (jobId) =>
      ipcRenderer.invoke(JOBS_CANCEL_CHANNEL, jobId) as Promise<boolean>,
    onEvent: (callback) => {
      const listener = (_event: IpcRendererEvent, jobEvent: JobEvent): void => {
        callback(jobEvent);
      };
      ipcRenderer.on(JOB_EVENT_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(JOB_EVENT_CHANNEL, listener);
      };
    },
  },
  media: {
    importUgc: (filePaths) =>
      ipcRenderer.invoke(MEDIA_IMPORT_UGC_CHANNEL, filePaths) as Promise<
        string[]
      >,
    get: (id) =>
      ipcRenderer.invoke(MEDIA_GET_CHANNEL, id) as Promise<Media | null>,
    byPaths: (paths) =>
      ipcRenderer.invoke(MEDIA_BY_PATHS_CHANNEL, paths) as Promise<
        MediaPathCheck[]
      >,
  },
  settings: {
    get: () =>
      ipcRenderer.invoke(SETTINGS_GET_CHANNEL) as Promise<EditorSettings>,
    update: (patch) =>
      ipcRenderer.invoke(SETTINGS_UPDATE_CHANNEL, patch) as Promise<
        { ok: true; value: EditorSettings } | { ok: false; message: string }
      >,
    getOpenDraft: () =>
      ipcRenderer.invoke(SETTINGS_GET_OPEN_DRAFT_CHANNEL) as Promise<
        string | null
      >,
    setOpenDraft: (draftId) =>
      ipcRenderer.invoke(
        SETTINGS_SET_OPEN_DRAFT_CHANNEL,
        draftId,
      ) as Promise<void>,
  },
  videos: {
    saveDraft: (recipe: Recipe) =>
      ipcRenderer.invoke(VIDEOS_SAVE_DRAFT_CHANNEL, recipe) as Promise<
        VideoResult<SavedDraft>
      >,
    list: (options) =>
      ipcRenderer.invoke(VIDEOS_LIST_CHANNEL, options) as Promise<Video[]>,
    get: (id) =>
      ipcRenderer.invoke(VIDEOS_GET_CHANNEL, id) as Promise<Video | null>,
    remove: (id, options) =>
      ipcRenderer.invoke(VIDEOS_REMOVE_CHANNEL, {
        id,
        deleteFile: options?.deleteFile,
      }) as Promise<VideoResult<RemovedVideo>>,
    exportFiles: (ids) =>
      ipcRenderer.invoke(VIDEOS_EXPORT_FILES_CHANNEL, ids) as Promise<
        Record<string, ExportFileState>
      >,
    export: (recipe: Recipe) =>
      ipcRenderer.invoke(VIDEOS_EXPORT_CHANNEL, recipe) as Promise<
        VideoResult<ExportStarted>
      >,
    reveal: (id) =>
      ipcRenderer.invoke(VIDEOS_REVEAL_CHANNEL, id) as Promise<
        VideoResult<true>
      >,
  },
  broll: {
    list: (productId) =>
      ipcRenderer.invoke(BROLL_LIST_CHANNEL, productId) as Promise<Media[]>,
    import: (productId, filePaths) =>
      ipcRenderer.invoke(BROLL_IMPORT_CHANNEL, {
        productId,
        filePaths,
      }) as Promise<BrollResult<string[]>>,
    remove: (id) =>
      ipcRenderer.invoke(BROLL_REMOVE_CHANNEL, id) as Promise<
        BrollResult<true>
      >,
  },
  products: {
    list: () =>
      ipcRenderer.invoke(PRODUCTS_LIST_CHANNEL) as Promise<ProductSummary[]>,
    create: (input) =>
      ipcRenderer.invoke(PRODUCTS_CREATE_CHANNEL, input) as Promise<
        ProductResult<ProductSummary>
      >,
    update: (input) =>
      ipcRenderer.invoke(PRODUCTS_UPDATE_CHANNEL, input) as Promise<
        ProductResult<ProductSummary>
      >,
    remove: (id) =>
      ipcRenderer.invoke(PRODUCTS_REMOVE_CHANNEL, id) as Promise<
        ProductResult<true>
      >,
    archive: (id) =>
      ipcRenderer.invoke(PRODUCTS_ARCHIVE_CHANNEL, id) as Promise<
        ProductResult<ProductSummary>
      >,
    touchLastUsed: (id) =>
      ipcRenderer.invoke(PRODUCTS_TOUCH_CHANNEL, id) as Promise<
        ProductResult<ProductSummary>
      >,
  },
  captions: {
    list: () => ipcRenderer.invoke(CAPTIONS_LIST_CHANNEL) as Promise<Caption[]>,
    create: (input) =>
      ipcRenderer.invoke(CAPTIONS_CREATE_CHANNEL, input) as Promise<
        CaptionResult<Caption>
      >,
    update: (input) =>
      ipcRenderer.invoke(CAPTIONS_UPDATE_CHANNEL, input) as Promise<
        CaptionResult<Caption>
      >,
    remove: (id) =>
      ipcRenderer.invoke(CAPTIONS_REMOVE_CHANNEL, id) as Promise<
        CaptionResult<true>
      >,
    bulkAdd: (input) =>
      ipcRenderer.invoke(CAPTIONS_BULK_ADD_CHANNEL, input) as Promise<
        CaptionResult<Caption[]>
      >,
  },
  dev: {
    importFixtures: () =>
      ipcRenderer.invoke(DEV_IMPORT_FIXTURES_CHANNEL) as Promise<string[]>,
  },
};

contextBridge.exposeInMainWorld("api", api);
