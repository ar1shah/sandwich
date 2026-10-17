import { spawn } from "node:child_process";

export type RunResult = {
  stdout: string;
  stderr: string;
};

export type RunBufferResult = {
  stdout: Buffer;
  stderr: string;
};

export type RunOptions = {
  timeoutMs?: number;
  // Working directory for the child. Defaults to the current process's.
  cwd?: string;
  // Abort kills the child; the promise rejects with AbortError after the child has closed.
  signal?: AbortSignal;
};

export class AbortError extends Error {
  constructor(message = "Aborted") {
    super(message);
    this.name = "AbortError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// Runs a binary with an argument array (never a shell string) and collects its raw output.
// On timeout or abort the child is SIGKILLed and this waits for its `close` event before
// rejecting, so callers can delete its output files afterwards (an open handle would block
// that on Windows).
function runCollect(
  bin: string,
  args: readonly string[],
  { timeoutMs = 60_000, cwd, signal }: RunOptions,
): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }

    const child = spawn(bin, args, { windowsHide: true, cwd });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    // Why we killed the child, if we did. Settled on `close`.
    let killedFor: Error | null = null;
    let settled = false;

    const killWith = (reason: Error): void => {
      if (killedFor) {
        return;
      }
      killedFor = reason;
      child.kill("SIGKILL");
    };
    const onAbort = (): void => killWith(new AbortError());
    const timer = setTimeout(
      () => killWith(new Error(`${bin} timed out after ${timeoutMs} ms`)),
      timeoutMs,
    );
    signal?.addEventListener("abort", onAbort, { once: true });

    const settle = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      action();
    };

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => settle(() => reject(error)));
    child.on("close", (code) => {
      settle(() => {
        if (killedFor) {
          reject(killedFor);
          return;
        }
        const result = {
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr).toString("utf8"),
        };
        if (code === 0) {
          resolve(result);
          return;
        }
        const tail = result.stderr.trim().split("\n").slice(-5).join("\n");
        reject(new Error(`${bin} exited with code ${code}: ${tail}`));
      });
    });
  });
}

// Text output (ffprobe JSON, `ffmpeg -version`, ...). stdout is decoded as UTF-8.
export async function runCapture(
  bin: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const { stdout, stderr } = await runCollect(bin, args, options);
  return { stdout: stdout.toString("utf8"), stderr };
}

// Binary output (rawvideo frames, ...). stdout is returned untouched.
export function runCaptureBuffer(
  bin: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunBufferResult> {
  return runCollect(bin, args, options);
}

export type StreamingOptions = {
  // Called with every stdout chunk as it arrives (ffmpeg `-progress pipe:1`).
  onStdoutChunk?: (chunk: string) => void;
  signal?: AbortSignal;
  cwd?: string;
};

// Runs a long job with live stdout and cancellation. On abort the child is killed and this
// waits for its `close` event before rejecting, so callers can safely delete its output
// files afterwards (an open handle would block that on Windows).
export function runStreaming(
  bin: string,
  args: readonly string[],
  { onStdoutChunk, signal, cwd }: StreamingOptions = {},
): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }

    const child = spawn(bin, args, { windowsHide: true, cwd });
    const stderr: Buffer[] = [];
    let aborted = false;
    let spawnError: Error | null = null;

    const onAbort = (): void => {
      aborted = true;
      child.kill("SIGKILL");
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => onStdoutChunk?.(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      // 'close' still follows a failed spawn or kill; settle there.
      spawnError = error;
    });
    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      const text = Buffer.concat(stderr).toString("utf8");
      if (aborted) {
        reject(new AbortError());
      } else if (spawnError) {
        reject(spawnError);
      } else if (code === 0) {
        resolve({ stderr: text });
      } else {
        const tail = text.trim().split("\n").slice(-5).join("\n");
        reject(new Error(`${bin} exited with code ${code}: ${tail}`));
      }
    });
  });
}
