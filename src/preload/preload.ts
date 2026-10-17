import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { JobEvent, JobInfo } from "../shared/jobs";
import type { LibraryCandidate, LibraryState } from "../shared/library";
import {
  APP_VERSION_CHANNEL,
  DEV_IMPORT_FIXTURES_CHANNEL,
  JOB_EVENT_CHANNEL,
  JOBS_CANCEL_CHANNEL,
  JOBS_LIST_CHANNEL,
  MEDIA_IMPORT_UGC_CHANNEL,
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
  dev: {
    importFixtures: () =>
      ipcRenderer.invoke(DEV_IMPORT_FIXTURES_CHANNEL) as Promise<string[]>,
  },
};

contextBridge.exposeInMainWorld("api", api);
