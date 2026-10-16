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
};

// Runs a binary with an argument array (never a shell string) and collects its raw output.
function runCollect(
  bin: string,
  args: readonly string[],
  { timeoutMs = 60_000, cwd }: RunOptions,
): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, cwd });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${bin} timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
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

export class AbortError extends Error {
  constructor(message = "Aborted") {
    super(message);
    this.name = "AbortError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

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
