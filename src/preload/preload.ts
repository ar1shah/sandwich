import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { JobEvent, JobInfo } from "../shared/jobs";
import type { LibraryCandidate, LibraryState } from "../shared/library";
import type { ProductResult, ProductSummary } from "../shared/products";
import {
  APP_VERSION_CHANNEL,
  DEV_IMPORT_FIXTURES_CHANNEL,
  JOB_EVENT_CHANNEL,
  JOBS_CANCEL_CHANNEL,
  JOBS_LIST_CHANNEL,
  MEDIA_IMPORT_UGC_CHANNEL,
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
  dev: {
    importFixtures: () =>
      ipcRenderer.invoke(DEV_IMPORT_FIXTURES_CHANNEL) as Promise<string[]>,
  },
};

contextBridge.exposeInMainWorld("api", api);
