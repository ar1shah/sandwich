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
