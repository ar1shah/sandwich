import type { LogLevel } from "../shared/logRotate";

// Sends an entry to the log file in main. Never throws and never produces an unhandled
// rejection of its own: a broken logger must not make a broken screen worse.
export function logToFile(
  level: LogLevel,
  message: string,
  stack?: string,
): void {
  try {
    void window.api.log.write({ level, message, stack }).catch(() => undefined);
  } catch {
    // The bridge itself is missing; there is nowhere to report to.
  }
}

// Errors thrown outside React's render (event handlers, timers) and promises nobody
// handled. A missing image does not come through here: resource errors do not bubble.
export function installGlobalErrorLogging(): void {
  window.addEventListener("error", (event) => {
    const error = event.error as unknown;
    logToFile(
      "error",
      event.message || "Unknown error",
      error instanceof Error ? error.stack : undefined,
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as unknown;
    logToFile(
      "error",
      `Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
      reason instanceof Error ? reason.stack : undefined,
    );
  });
}
