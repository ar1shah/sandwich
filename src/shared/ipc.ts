// IPC contract shared by main, preload and renderer. Types and constants only.
import type {
  LibraryActivateOptions,
  LibraryCandidate,
  LibraryChooseSource,
  LibraryState,
} from "./library";

export const APP_VERSION_CHANNEL = "app:version";
export const LIBRARY_MEDIA_BASE_URL_CHANNEL = "library:mediaBaseUrl";
export const LIBRARY_GET_CHANNEL = "library:get";
export const LIBRARY_CHOOSE_CHANNEL = "library:choose";
export const LIBRARY_ACTIVATE_CHANNEL = "library:activate";

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
};
