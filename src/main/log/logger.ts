import {
  appendFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  backupFileName,
  formatLogLine,
  LOG_BACKUPS,
  LOG_FILE_NAME,
  LOG_MAX_BYTES,
  shouldRotate,
  type LogLevel,
} from "../../shared/logRotate";

export type LoggerOptions = {
  // <userData>/logs. Not the library: that folder may be synced.
  dir: string;
  now?: () => Date;
  maxBytes?: number;
  backups?: number;
};

// A rotating log file. Normal entries are queued and appended one at a time off the main
// thread's critical path (CLAUDE.md rule 5); only the fatal path and the final flush at quit
// write synchronously. Logging never throws: a full disk must not take the app down.
export function createLogger(options: LoggerOptions) {
  const now = options.now ?? (() => new Date());
  const maxBytes = options.maxBytes ?? LOG_MAX_BYTES;
  const backups = options.backups ?? LOG_BACKUPS;
  const file = path.join(options.dir, LOG_FILE_NAME);
  const backupPath = (index: number) =>
    path.join(options.dir, backupFileName(LOG_FILE_NAME, index));

  let queue: string[] = [];
  let draining: Promise<void> | null = null;

  async function rotate(): Promise<void> {
    await rm(backupPath(backups), { force: true });
    for (let index = backups - 1; index >= 0; index -= 1) {
      await rename(backupPath(index), backupPath(index + 1)).catch(
        () => undefined,
      );
    }
  }

  async function drain(): Promise<void> {
    await mkdir(options.dir, { recursive: true });
    while (queue.length > 0) {
      const lines = queue;
      queue = [];
      const text = lines.join("");
      const size = await stat(file)
        .then((s) => s.size)
        .catch(() => 0);
      if (shouldRotate(size, Buffer.byteLength(text), maxBytes)) {
        await rotate();
      }
      await appendFile(file, text);
    }
  }

  function startDrain(): Promise<void> {
    draining ??= drain()
      .catch(() => {
        // The folder or disk is not writable: drop what was queued rather than retry forever.
        queue = [];
      })
      .finally(() => {
        draining = null;
        // Entries that arrived while the last write was finishing.
        if (queue.length > 0) {
          void startDrain();
        }
      });
    return draining;
  }

  function rotateSync(): void {
    rmSync(backupPath(backups), { force: true });
    for (let index = backups - 1; index >= 0; index -= 1) {
      try {
        renameSync(backupPath(index), backupPath(index + 1));
      } catch {
        // That backup does not exist yet.
      }
    }
  }

  // Appends everything queued so far, synchronously. For the crash path and for quit, where
  // there is no later turn of the event loop to wait for.
  function flushSync(extra = ""): void {
    const text = queue.join("") + extra;
    queue = [];
    if (text === "") {
      return;
    }
    try {
      mkdirSync(options.dir, { recursive: true });
      let size = 0;
      try {
        size = statSync(file).size;
      } catch {
        size = 0;
      }
      if (shouldRotate(size, Buffer.byteLength(text), maxBytes)) {
        rotateSync();
      }
      appendFileSync(file, text);
    } catch {
      // Nothing more can be done about a log that cannot be written.
    }
  }

  return {
    file,
    log(level: LogLevel, scope: string, message: string): void {
      try {
        queue.push(formatLogLine(level, scope, message, now()));
        void startDrain();
      } catch {
        // Never throw from logging.
      }
    },
    // The fatal path: the entry is on disk before this returns.
    logSync(level: LogLevel, scope: string, message: string): void {
      try {
        flushSync(formatLogLine(level, scope, message, now()));
      } catch {
        // Never throw from logging.
      }
    },
    flushSync(): void {
      flushSync();
    },
    // Resolves when everything queued so far is written (tests, and a clean quit).
    async flush(): Promise<void> {
      while (draining || queue.length > 0) {
        await startDrain();
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
