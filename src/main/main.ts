import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { formatCapabilityReport } from "../shared/capabilitiesParse";
import {
  APP_VERSION_CHANNEL,
  SPIKE_PROGRESS_CHANNEL,
  SPIKE_RENDER_CHANNEL,
} from "../shared/ipc";
import { spikeRenderRequestSchema } from "../shared/spikeProps";
import {
  getIntegrationRenderOutputPath,
  runIntegrationRenderTest,
} from "./integration-render-test-mode";
import { resolveFfPaths } from "./media/binaries";
import { getFfCapabilities } from "./media/capabilities";
import { runSpike } from "./spike/spike";

let mainWindow: BrowserWindow | null = null;
const integrationRenderOutputPath = getIntegrationRenderOutputPath();

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

let spikeRunning = false;

// Step 0.4 spike: renders the Spike composition in the main process and streams progress.
ipcMain.handle(
  SPIKE_RENDER_CHANNEL,
  async (event: IpcMainInvokeEvent, payload: unknown) => {
    assertTrustedSender(event);
    const { mode } = spikeRenderRequestSchema.parse(payload);
    if (spikeRunning) {
      throw new Error("A spike render is already running.");
    }
    spikeRunning = true;
    try {
      return await runSpike({
        mode,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(SPIKE_PROGRESS_CHANNEL, progress);
          }
        },
      });
    } finally {
      spikeRunning = false;
    }
  },
);

app.on("ready", () => {
  if (integrationRenderOutputPath) {
    void runIntegrationRenderTest(integrationRenderOutputPath);
    return;
  }

  createWindow();
  void logFfCapabilities();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (integrationRenderOutputPath) {
    return;
  }

  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
