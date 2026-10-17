import type {
  LibraryActivateOptions,
  LibraryCandidate,
  LibraryChooseSource,
  LibraryState,
} from "../../shared/library";
import { closeDatabase } from "../db/connection";
import type { Repos } from "../db/repos";
import { inspectFolder, syncProviderOf } from "./inspectFolder";
import { openLibrary, type OpenLibrary } from "./openLibrary";
import type { SettingsStore } from "./settings";

export type LibraryManagerDeps = {
  settings: SettingsStore;
  defaultPath: string;
  // Native folder dialog; null = cancelled.
  pickFolder: () => Promise<string | null>;
};

// Owns the active library (folder + open database) and the two-phase switch:
// choose() inspects a folder and remembers it, activate() opens that remembered folder.
// The renderer never sends a path back, only picks from what main offered.
export function createLibraryManager({
  settings,
  defaultPath,
  pickFolder,
}: LibraryManagerDeps) {
  let active: OpenLibrary | null = null;
  let state: LibraryState = { status: "unconfigured", defaultPath };
  let pending: LibraryCandidate | null = null;
  let initPromise: Promise<void> | null = null;

  async function readyState(root: string): Promise<LibraryState> {
    return {
      status: "ready",
      path: root,
      syncProvider: await syncProviderOf(root),
    };
  }

  async function init(): Promise<void> {
    const { libraryPath } = await settings.read();
    if (!libraryPath) {
      return;
    }
    try {
      active = await openLibrary(libraryPath, { mustExist: true });
      state = await readyState(libraryPath);
    } catch (error) {
      // Keep the saved path: the drive may just be disconnected.
      state = {
        status: "error",
        path: libraryPath,
        message: error instanceof Error ? error.message : String(error),
        defaultPath,
      };
    }
  }

  function ensureInit(): Promise<void> {
    initPromise ??= init();
    return initPromise;
  }

  return {
    init: ensureInit,

    async getState(): Promise<LibraryState> {
      await ensureInit();
      return state;
    },

    async choose(
      source: LibraryChooseSource,
    ): Promise<LibraryCandidate | null> {
      await ensureInit();
      if (source === "default") {
        pending = await inspectFolder(defaultPath, { allowSubfolder: false });
        return pending;
      }
      const picked = await pickFolder();
      if (!picked) {
        return null;
      }
      pending = await inspectFolder(picked, { allowSubfolder: true });
      return pending;
    },

    async activate(options?: LibraryActivateOptions): Promise<LibraryState> {
      await ensureInit();
      if (!pending) {
        throw new Error("Choose a library folder first.");
      }
      let candidate = pending;
      if (options?.useChosenFolder && candidate.chosenPath) {
        candidate = await inspectFolder(candidate.chosenPath, {
          allowSubfolder: false,
        });
      }
      if (candidate.schemaTooNew) {
        throw new Error(
          "This library was made by a newer version of Sandwich. Update the app to open it.",
        );
      }

      // Open the new library before letting go of the old one, so a failure leaves the
      // current library active.
      const next = await openLibrary(candidate.path);
      try {
        await settings.write({ libraryPath: candidate.path });
      } catch (error) {
        closeDatabase(next.db);
        throw error;
      }
      const previous = active;
      active = next;
      state = await readyState(candidate.path);
      pending = null;
      if (previous) {
        closeDatabase(previous.db);
      }
      return state;
    },

    // The media server reads this on every request, so a switch re-roots immediately.
    getRoot: (): string | null => active?.root ?? null,
    getRepos: (): Repos | null => active?.repos ?? null,

    close(): void {
      if (active) {
        closeDatabase(active.db);
        active = null;
      }
    },
  };
}

export type LibraryManager = ReturnType<typeof createLibraryManager>;
