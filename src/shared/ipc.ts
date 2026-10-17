// IPC contract shared by main, preload and renderer. Types and constants only.
import type {
  LibraryActivateOptions,
  LibraryCandidate,
  LibraryChooseSource,
  LibraryState,
} from "./library";
import type { JobEvent, JobInfo } from "./jobs";

export const APP_VERSION_CHANNEL = "app:version";
export const LIBRARY_MEDIA_BASE_URL_CHANNEL = "library:mediaBaseUrl";
export const LIBRARY_GET_CHANNEL = "library:get";
export const LIBRARY_CHOOSE_CHANNEL = "library:choose";
export const LIBRARY_ACTIVATE_CHANNEL = "library:activate";
export const JOBS_LIST_CHANNEL = "jobs:list";
export const JOBS_CANCEL_CHANNEL = "jobs:cancel";
export const MEDIA_IMPORT_UGC_CHANNEL = "media:importUgc";
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
  dev: {
    // Queues every clip in the project's fixtures/ folder. Rejects in packaged builds.
    importFixtures: () => Promise<string[]>;
  };
};
