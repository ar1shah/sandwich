import { contextBridge, ipcRenderer } from "electron";
import type { LibraryCandidate, LibraryState } from "../shared/library";
import {
  APP_VERSION_CHANNEL,
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
};

contextBridge.exposeInMainWorld("api", api);
