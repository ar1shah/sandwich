import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AbortError, isAbortError, runCapture } from "../src/main/media/run";
import { makeTempDir } from "./helpers/db";

// A child that records its pid, then idles forever.
const IDLE_SCRIPT =
  "require('fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForPid(file: string): Promise<number> {
  for (let i = 0; i < 100; i++) {
    if (existsSync(file) && readFileSync(file, "utf8")) {
      return Number(readFileSync(file, "utf8"));
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("child never started");
}

describe("runCapture kill handling", () => {
  it("abort kills the child and rejects with AbortError only after it has closed", async () => {
    const pidFile = path.join(makeTempDir(), "pid");
    const controller = new AbortController();
    const result = runCapture(process.execPath, ["-e", IDLE_SCRIPT, pidFile], {
      signal: controller.signal,
      timeoutMs: 30_000,
    });
    const pid = await waitForPid(pidFile);
    controller.abort();
    await expect(result).rejects.toSatisfy(isAbortError);
    expect(isAlive(pid)).toBe(false);
  });

  it("an already aborted signal rejects without spawning", async () => {
    const pidFile = path.join(makeTempDir(), "pid");
    const controller = new AbortController();
    controller.abort();
    await expect(
      runCapture(process.execPath, ["-e", IDLE_SCRIPT, pidFile], {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(AbortError);
    expect(existsSync(pidFile)).toBe(false);
  });

  it("timeout SIGKILLs the child and rejects only after it has closed", async () => {
    const pidFile = path.join(makeTempDir(), "pid");
    const result = runCapture(process.execPath, ["-e", IDLE_SCRIPT, pidFile], {
      timeoutMs: 400,
    });
    await expect(result).rejects.toThrow(/timed out after 400 ms/);
    expect(isAlive(await waitForPid(pidFile))).toBe(false);
  });

  it("still returns output and reports non-zero exits", async () => {
    const ok = await runCapture(process.execPath, [
      "-e",
      "process.stdout.write('hi')",
    ]);
    expect(ok.stdout).toBe("hi");
    await expect(
      runCapture(process.execPath, [
        "-e",
        "console.error('bad'); process.exit(3)",
      ]),
    ).rejects.toThrow(/exited with code 3: bad/);
    await expect(
      runCapture("definitely-not-a-binary-xyz", []),
    ).rejects.toThrow();
  });

  it("settles once on a spawn failure", async () => {
    writeFileSync(path.join(makeTempDir(), "x"), "");
    await expect(
      runCapture("definitely-not-a-binary-xyz", ["a"]),
    ).rejects.toThrow(/ENOENT/);
  });
});
