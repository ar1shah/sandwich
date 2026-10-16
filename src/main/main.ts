import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { formatCapabilityReport } from "../shared/capabilitiesParse";
import {
  APP_VERSION_CHANNEL,
  LIBRARY_MEDIA_BASE_URL_CHANNEL,
} from "../shared/ipc";
import { resolveFfPaths } from "./media/binaries";
import { getFfCapabilities } from "./media/capabilities";
import { startMediaServer, type MediaServer } from "./media/mediaServer";
import {
  getRenderRecipeTestArgs,
  runRenderRecipeTest,
} from "./render/render-recipe-test-mode";

let mainWindow: BrowserWindow | null = null;
// `Sandwich --render-recipe <recipe> <out.mp4>`: render once without a window, then exit.
const renderRecipeTestArgs = getRenderRecipeTestArgs(process.argv);

if (app.isPackaged) {
  process.chdir(app.getPath("userData"));
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    throw new Error("Blocked IPC call from an unknown renderer.");
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
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

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

async function logFfCapabilities(): Promise<void> {
  try {
    const { ffmpeg } = resolveFfPaths({
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      platform: process.platform,
      arch: process.arch,
    });
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

// App-wide media server. Dev serves fixtures/; packaged builds have no library root
// until step 2.1, so requests get 503. 2.1 only changes what getRoot returns.
function getLibraryRoot(): string | null {
  return app.isPackaged ? null : path.join(app.getAppPath(), "fixtures");
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

ipcMain.handle(
  LIBRARY_MEDIA_BASE_URL_CHANNEL,
  async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event);
    return (await ensureMediaServer()).baseUrl;
  },
);

app.on("will-quit", () => {
  void mediaServer?.close();
});

app.on("ready", () => {
  if (renderRecipeTestArgs) {
    void runRenderRecipeTest(renderRecipeTestArgs);
    return;
  }

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
  if (renderRecipeTestArgs) {
    return;
  }

  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
