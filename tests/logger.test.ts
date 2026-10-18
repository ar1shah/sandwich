import { chmodSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/main/log/logger";
import { makeTempDir } from "./helpers/db";

const NOW = new Date("2026-10-18T09:30:00.000Z");
const options = (dir: string, extra = {}) => ({
  dir,
  now: () => NOW,
  ...extra,
});

describe("logger", () => {
  it("creates the folder and appends entries in order", async () => {
    const dir = path.join(makeTempDir(), "logs");
    const log = createLogger(options(dir));
    log.log("info", "main", "first");
    log.log("error", "main", "second");
    await log.flush();
    expect(readFileSync(log.file, "utf8")).toBe(
      "2026-10-18T09:30:00.000Z INFO [main] first\n" +
        "2026-10-18T09:30:00.000Z ERROR [main] second\n",
    );
  });

  it("redacts the media token on the way to disk", async () => {
    const dir = makeTempDir();
    const log = createLogger(options(dir));
    log.log(
      "error",
      "renderer",
      "Failed to load http://127.0.0.1:9/m/AbCdEfGh_ijklMNOP-qrstuvwxyz012345/clips/a.mp4",
    );
    await log.flush();
    const text = readFileSync(log.file, "utf8");
    expect(text).not.toContain("AbCdEfGh");
    expect(text).toContain("/m/[token]/clips/a.mp4");
  });

  it("rotates at the limit, keeping a bounded number of backups", async () => {
    const dir = makeTempDir();
    const log = createLogger(options(dir, { maxBytes: 200, backups: 2 }));
    for (let i = 0; i < 12; i += 1) {
      log.log("info", "main", `entry ${i} ${"x".repeat(60)}`);
      await log.flush();
    }
    expect(readdirSync(dir).sort()).toEqual([
      "sandwich.1.log",
      "sandwich.2.log",
      "sandwich.log",
    ]);
    // The newest entry is in the live file; the oldest ones were dropped.
    expect(readFileSync(path.join(dir, "sandwich.log"), "utf8")).toContain(
      "entry 11",
    );
    const all = ["sandwich.log", "sandwich.1.log", "sandwich.2.log"]
      .map((name) => readFileSync(path.join(dir, name), "utf8"))
      .join("");
    expect(all).not.toContain("entry 0 ");
    expect(
      readFileSync(path.join(dir, "sandwich.1.log"), "utf8").length,
    ).toBeLessThanOrEqual(300);
  });

  it("logSync is on disk before it returns, after anything already queued", () => {
    const dir = makeTempDir();
    const log = createLogger(options(dir));
    log.log("info", "main", "queued");
    log.logSync("error", "main", "fatal");
    const text = readFileSync(log.file, "utf8");
    expect(text).toContain("INFO [main] queued");
    expect(text.indexOf("queued")).toBeLessThan(text.indexOf("fatal"));
  });

  it("flushSync writes what is still queued", () => {
    const dir = makeTempDir();
    const log = createLogger(options(dir));
    log.log("info", "main", "pending");
    log.flushSync();
    expect(readFileSync(log.file, "utf8")).toContain("pending");
  });

  it("never throws when the folder cannot be written", async () => {
    const dir = makeTempDir();
    chmodSync(dir, 0o500);
    try {
      const log = createLogger(options(path.join(dir, "logs")));
      expect(() => log.log("error", "main", "lost")).not.toThrow();
      expect(() => log.logSync("error", "main", "lost too")).not.toThrow();
      await log.flush();
      expect(existsSync(path.join(dir, "logs", "sandwich.log"))).toBe(false);
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});
