import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { APP_OPEN_LOGS_CHANNEL, LOG_WRITE_CHANNEL } from "../../shared/ipc";
import { RendererLogEntrySchema } from "../../shared/logRotate";
import { createRateLimiter } from "../../shared/rateLimit";
import type { Logger } from "../log/logger";

// A renderer stuck in an error loop must not be able to fill the disk or the queue.
const MAX_ENTRIES = 50;
const WINDOW_MS = 10_000;

export function registerLogIpc({
  logger,
  logsDir,
  openFolder,
  assertTrustedSender,
}: {
  logger: Logger;
  logsDir: string;
  // shell.openPath in the app, behind a wrapper so a test can replace it. Resolves with an
  // error message, or "" when it worked (Electron's own convention).
  openFolder: (dir: string) => Promise<string>;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
}): void {
  const limiter = createRateLimiter(MAX_ENTRIES, WINDOW_MS);

  ipcMain.handle(LOG_WRITE_CHANNEL, (event, entry: unknown) => {
    assertTrustedSender(event);
    const parsed = RendererLogEntrySchema.safeParse(entry);
    if (!parsed.success || !limiter.take()) {
      return;
    }
    const { level, message, stack } = parsed.data;
    logger.log(level, "renderer", stack ? `${message}\n${stack}` : message);
  });

  // The folder is main's own, never a path from the renderer.
  ipcMain.handle(APP_OPEN_LOGS_CHANNEL, async (event) => {
    assertTrustedSender(event);
    try {
      const problem = await openFolder(logsDir);
      return problem === ""
        ? { ok: true as const }
        : { ok: false as const, message: problem };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
