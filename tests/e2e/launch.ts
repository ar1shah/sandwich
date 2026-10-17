import {
  _electron as electron,
  type ElectronApplication,
} from "@playwright/test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The executable inside the bundle that `npm run make` (electron-forge package) writes to
// out/Sandwich-<platform>-<arch>/. SANDWICH_E2E_APP overrides it.
export function packagedExecutable(): string {
  const override = process.env.SANDWICH_E2E_APP;
  if (override) {
    return path.resolve(override);
  }
  const dir = path.resolve(
    "out",
    `Sandwich-${process.platform}-${process.arch}`,
  );
  switch (process.platform) {
    case "darwin":
      return path.join(dir, "Sandwich.app", "Contents", "MacOS", "Sandwich");
    case "win32":
      return path.join(dir, "Sandwich.exe");
    default:
      return path.join(dir, "Sandwich");
  }
}

export type LaunchedApp = {
  app: ElectronApplication;
  libraryDir: string;
  userDataDir: string;
};

// Starts the packaged app with a throwaway userData folder, so it never touches the real
// settings or library. The native folder dialog is replaced in the main process so the
// welcome flow can pick `libraryDir` (an empty temp folder).
export async function launchPackagedApp(): Promise<LaunchedApp> {
  const executablePath = packagedExecutable();
  if (!existsSync(executablePath)) {
    throw new Error(
      `No packaged app at ${executablePath}. Run "npm run make" first (it runs electron-forge package).`,
    );
  }
  const userDataDir = mkdtempSync(path.join(tmpdir(), "sandwich-e2e-user-"));
  const libraryDir = mkdtempSync(path.join(tmpdir(), "sandwich-e2e-lib-"));
  const app = await electron.launch({
    executablePath,
    env: { ...process.env, SANDWICH_USER_DATA: userDataDir },
  });
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [folder] });
  }, libraryDir);
  return { app, libraryDir, userDataDir };
}
