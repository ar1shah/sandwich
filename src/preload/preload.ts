import { contextBridge, ipcRenderer } from "electron";
import { APP_VERSION_CHANNEL, type SandwichApi } from "../shared/ipc";

const api: SandwichApi = {
  app: {
    version: () => ipcRenderer.invoke(APP_VERSION_CHANNEL) as Promise<string>,
  },
};

contextBridge.exposeInMainWorld("api", api);
