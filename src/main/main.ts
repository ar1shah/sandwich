import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isAppPageUrl } from "../shared/appNavigation";
import { formatCapabilityReport } from "../shared/capabilitiesParse";
import { APP_VERSION_CHANNEL, JOB_EVENT_CHANNEL } from "../shared/ipc";
import { createJobEventThrottle } from "../shared/jobEventThrottle";
import { DEFAULT_LIBRARY_FOLDER_NAME } from "../shared/library";
import { registerJobsIpc } from "./ipc/jobs";
import { registerLibraryIpc } from "./ipc/library";
import { createBrollService } from "./broll/brollService";
import { createCaptionService } from "./captions/captionService";
import { registerBrollIpc } from "./ipc/broll";
import { registerCaptionsIpc } from "./ipc/captions";
import { registerMediaIpc } from "./ipc/media";
import { registerSettingsIpc } from "./ipc/settings";
import { registerVideosIpc } from "./ipc/videos";
import { createMediaLookup } from "./media/mediaLookup";
import { createEditorSettingsService } from "./settings/editorSettingsService";
import { createVideoService } from "./videos/videoService";
import { registerProductsIpc } from "./ipc/products";
import { createJobService } from "./jobs";
import { createFfmpegSteps } from "./jobs/importClip";
import {
  getDbCheckTestArgs,
  runDbCheckTest,
} from "./library/db-check-test-mode";
import { createLibraryManager } from "./library/libraryManager";
import { createSettingsStore } from "./library/settings";
import { resolveFfPaths, type FfPaths } from "./media/binaries";
import { processProductImage } from "./media/productImage";
import { createProductService } from "./products/productService";
import { getFfCapabilities } from "./media/capabilities";
import { startMediaServer, type MediaServer } from "./media/mediaServer";
import {
  getRenderRecipeTestArgs,
  runRenderRecipeTest,
} from "./render/render-recipe-test-mode";

let mainWindow: BrowserWindow | null = null;
// `Sandwich --render-recipe <recipe> <out.mp4>`: render once without a window, then exit.
const renderRecipeTestArgs = getRenderRecipeTestArgs(process.argv);
// `Sandwich --db-check <dir>`: open a library, round-trip a row, then exit.
const dbCheckTestArgs = getDbCheckTestArgs(process.argv);
const headlessTestMode =
  renderRecipeTestArgs !== null || dbCheckTestArgs !== null;

// Must run before the app is ready. Unpackaged runs get their own userData so a dev build
// with newer migrations can never open (and migrate forward) the real library that the
// packaged app uses. SANDWICH_USER_DATA overrides both, for tests and fresh-launch checks.
function configureUserDataPath(): void {
  const override = process.env.SANDWICH_USER_DATA;
  if (override) {
    app.setPath("userData", path.resolve(override));
  } else if (!app.isPackaged) {
    app.setPath("userData", path.join(app.getPath("appData"), "Sandwich-dev"));
  }
}
configureUserDataPath();

if (app.isPackaged) {
  process.chdir(app.getPath("userData"));
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    throw new Error("Blocked IPC call from an unknown renderer.");
  }
}

// The one page the window may show: the dev server in dev, the bundled index.html packaged.
function appPageUrl(): string {
  return (
    MAIN_WINDOW_VITE_DEV_SERVER_URL ??
    pathToFileURL(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    ).toString()
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 600,
    backgroundColor: "#0f1115",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
  // A file dropped outside a drop zone, or a stray link, must not replace the app.
  const allowedUrl = appPageUrl();
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAppPageUrl(url, allowedUrl)) {
      event.preventDefault();
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

function getAppFfPaths(): FfPaths {
  return resolveFfPaths({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    platform: process.platform,
    arch: process.arch,
  });
}

async function logFfCapabilities(): Promise<void> {
  try {
    const { ffmpeg } = getAppFfPaths();
    const report = await getFfCapabilities(ffmpeg);
    const log = report.ok ? console.log : console.error;
    log(`[ffmpeg] ${formatCapabilityReport(report)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ffmpeg] Capability check failed: ${message}`);
  }
}

ipcMain.handle(APP_VERSION_CHANNEL, (event: IpcMainInvokeEvent) => {
  assertTrustedSender(event);
  return app.getVersion();
});

const settingsStore = createSettingsStore(
  path.join(app.getPath("userData"), "settings.json"),
);

const libraryManager = createLibraryManager({
  settings: settingsStore,
  // ~/Movies/SandwichLibrary on macOS, the Videos folder on Windows.
  defaultPath: path.join(app.getPath("videos"), DEFAULT_LIBRARY_FOLDER_NAME),
  pickFolder: async () => {
    const options = {
      title: "Choose or create your Sandwich library folder",
      properties: ["openDirectory", "createDirectory"] as (
        | "openDirectory"
        | "createDirectory"
      )[],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  },
  // A library switch ends the old library's jobs before its database closes.
  beforeClosePrevious: () => jobService.cancelAll(),
});

// Job events go to the window if there is one. On macOS the window can close while jobs
// keep running; the next window loads a fresh snapshot. Progress ticks are throttled,
// state changes always go out.
const jobEventThrottle = createJobEventThrottle({
  send: (event) => {
    const contents = mainWindow?.webContents;
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      contents &&
      !contents.isDestroyed()
    ) {
      contents.send(JOB_EVENT_CHANNEL, event);
    }
  },
});

const jobService = createJobService({
  getLibrary: () => {
    const root = libraryManager.getRoot();
    const repos = libraryManager.getRepos();
    return root && repos ? { root, repos } : null;
  },
  onEvent: (event) => jobEventThrottle.push(event),
  steps: createFfmpegSteps(getAppFfPaths()),
});

// App-wide media server. Serves the active library; with no library yet requests get 503.
// The root is read per request, so switching libraries re-roots it without a restart.
function getLibraryRoot(): string | null {
  return libraryManager.getRoot();
}

let mediaServerPromise: Promise<MediaServer> | null = null;
let mediaServer: MediaServer | null = null;

function ensureMediaServer(): Promise<MediaServer> {
  mediaServerPromise ??= startMediaServer({ getRoot: getLibraryRoot }).then(
    (server) => {
      mediaServer = server;
      // Port only: the base URL contains the session token.
      console.log(`[media] server listening on port ${server.port}`);
      return server;
    },
  );
  return mediaServerPromise;
}

registerLibraryIpc({
  manager: libraryManager,
  getMediaBaseUrl: async () => (await ensureMediaServer()).baseUrl,
  assertTrustedSender,
});

registerJobsIpc({ jobs: jobService, assertTrustedSender });

const productService = createProductService({
  getLibrary: () => {
    const root = libraryManager.getRoot();
    const repos = libraryManager.getRepos();
    return root && repos ? { root, repos } : null;
  },
  processImage: (input, output) =>
    processProductImage(input, output, { ffPaths: getAppFfPaths() }),
  hasActiveJobForProduct: (productId) =>
    jobService.hasActiveForProduct(productId),
});
registerProductsIpc({ products: productService, assertTrustedSender });
registerBrollIpc({
  broll: createBrollService({
    getLibrary: () => {
      const root = libraryManager.getRoot();
      const repos = libraryManager.getRepos();
      return root && repos ? { root, repos } : null;
    },
    jobs: jobService,
  }),
  assertTrustedSender,
});
registerCaptionsIpc({
  captions: createCaptionService({
    getLibrary: () => {
      const repos = libraryManager.getRepos();
      return repos ? { repos } : null;
    },
  }),
  assertTrustedSender,
});
registerVideosIpc({
  videos: createVideoService({
    getLibrary: () => {
      const repos = libraryManager.getRepos();
      return repos ? { repos } : null;
    },
  }),
  assertTrustedSender,
});
registerSettingsIpc({
  settings: createEditorSettingsService({
    store: settingsStore,
    getRoot: () => libraryManager.getRoot(),
  }),
  assertTrustedSender,
});
registerMediaIpc({
  jobs: jobService,
  lookup: createMediaLookup({
    getLibrary: () => {
      const root = libraryManager.getRoot();
      const repos = libraryManager.getRepos();
      return root && repos ? { root, repos } : null;
    },
  }),
  assertTrustedSender,
  // Dev builds only: app.getAppPath() is the project root there.
  devFixturesDir: app.isPackaged
    ? null
    : path.join(app.getAppPath(), "fixtures"),
});

// will-quit is synchronous, so running jobs must be stopped here first: cancelAll resolves
// only after every ffmpeg child has closed, and only then may the database close. Runs once.
let quitGuardDone = false;
app.on("before-quit", (event) => {
  if (quitGuardDone || !jobService.hasActive()) {
    return;
  }
  quitGuardDone = true;
  event.preventDefault();
  void jobService.cancelAll().finally(() => {
    app.quit();
  });
});

app.on("will-quit", () => {
  jobEventThrottle.dispose();
  void mediaServer?.close();
  libraryManager.close();
});

app.on("ready", () => {
  if (renderRecipeTestArgs) {
    void runRenderRecipeTest(renderRecipeTestArgs);
    return;
  }
  if (dbCheckTestArgs) {
    void runDbCheckTest(dbCheckTestArgs);
    return;
  }

  void libraryManager.init().catch((error: unknown) => {
    console.error(
      `[library] failed to open: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  void ensureMediaServer().catch((error: unknown) => {
    console.error(
      `[media] server failed to start: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  createWindow();
  void logFfCapabilities();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (headlessTestMode) {
    return;
  }

  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
