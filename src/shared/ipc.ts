// IPC contract shared by main, preload and renderer. Types and constants only.
import type {
  SpikeProgress,
  SpikeRenderRequest,
  SpikeResult,
} from "./spikeProps";

export const APP_VERSION_CHANNEL = "app:version";
export const LIBRARY_MEDIA_BASE_URL_CHANNEL = "library:mediaBaseUrl";
// Step 0.4 spike channels (removed with the spike, see CHECKLIST 1.4).
export const SPIKE_RENDER_CHANNEL = "spike:render";
export const SPIKE_PROGRESS_CHANNEL = "spike:progress";

export type SandwichApi = {
  app: {
    version: () => Promise<string>;
  };
  library: {
    // http://127.0.0.1:<port>/m/<token>; build file URLs with mediaUrl(base, relPath).
    mediaBaseUrl: () => Promise<string>;
  };
  spike: {
    render: (request: SpikeRenderRequest) => Promise<SpikeResult>;
    // Returns an unsubscribe function.
    onProgress: (callback: (progress: SpikeProgress) => void) => () => void;
  };
};
