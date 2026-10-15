import { spawn } from "node:child_process";

export type RunResult = {
  stdout: string;
  stderr: string;
};

// Runs a binary with an argument array (never a shell string) and collects its output.
export function runCapture(
  bin: string,
  args: readonly string[],
  { timeoutMs = 60_000 }: { timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
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
        stdout: Buffer.concat(stdout).toString("utf8"),
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
