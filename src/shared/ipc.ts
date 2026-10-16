// IPC contract shared by main, preload and renderer. Types and constants only.
export const APP_VERSION_CHANNEL = "app:version";
export const LIBRARY_MEDIA_BASE_URL_CHANNEL = "library:mediaBaseUrl";

export type SandwichApi = {
  app: {
    version: () => Promise<string>;
  };
  library: {
    // http://127.0.0.1:<port>/m/<token>; build file URLs with mediaUrl(base, relPath).
    mediaBaseUrl: () => Promise<string>;
  };
};
