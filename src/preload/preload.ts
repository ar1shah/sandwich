import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  APP_VERSION_CHANNEL,
  SPIKE_PROGRESS_CHANNEL,
  SPIKE_RENDER_CHANNEL,
  type SandwichApi,
} from "../shared/ipc";
import type { SpikeProgress, SpikeResult } from "../shared/spikeProps";

const api: SandwichApi = {
  app: {
    version: () => ipcRenderer.invoke(APP_VERSION_CHANNEL) as Promise<string>,
  },
  spike: {
    render: (request) =>
      ipcRenderer.invoke(SPIKE_RENDER_CHANNEL, request) as Promise<SpikeResult>,
    onProgress: (callback) => {
      const listener = (_event: IpcRendererEvent, progress: SpikeProgress) => {
        callback(progress);
      };
      ipcRenderer.on(SPIKE_PROGRESS_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(SPIKE_PROGRESS_CHANNEL, listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld("api", api);
