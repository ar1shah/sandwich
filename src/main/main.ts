import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { APP_VERSION_CHANNEL } from "../shared/ipc";
import {
  getIntegrationRenderOutputPath,
  runIntegrationRenderTest,
} from "./integration-render-test-mode";

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

ipcMain.handle(APP_VERSION_CHANNEL, (event: IpcMainInvokeEvent) => {
  assertTrustedSender(event);
  return app.getVersion();
});

app.on("ready", () => {
  if (integrationRenderOutputPath) {
    void runIntegrationRenderTest(integrationRenderOutputPath);
    return;
  }

  createWindow();
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
