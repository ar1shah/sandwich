import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getBetterSqlitePrebuilds } from "../src/main/db/prebuilds";

describe("getBetterSqlitePrebuilds", () => {
  it("returns the single prebuild for the target", () => {
    expect(
      getBetterSqlitePrebuilds({ platform: "darwin", arch: "arm64" }),
    ).toEqual(["darwin-arm64.node"]);
    expect(
      getBetterSqlitePrebuilds({ platform: "win32", arch: "x64" }),
    ).toEqual(["win32-x64.node"]);
  });

  it("returns both architectures for a macOS universal build", () => {
    expect(
      getBetterSqlitePrebuilds({ platform: "darwin", arch: "universal" }),
    ).toEqual(["darwin-arm64.node", "darwin-x64.node"]);
  });

  it("throws for unsupported targets", () => {
    expect(() =>
      getBetterSqlitePrebuilds({ platform: "darwin", arch: "ia32" }),
    ).toThrow();
    expect(() =>
      getBetterSqlitePrebuilds({ platform: "freebsd", arch: "x64" }),
    ).toThrow();
  });

  it("every file it names exists in the installed package", () => {
    const dir = path.join(
      process.cwd(),
      "node_modules",
      "better-sqlite3",
      "prebuilds",
    );
    for (const target of [
      { platform: "darwin", arch: "universal" },
      { platform: "win32", arch: "x64" },
      { platform: "win32", arch: "arm64" },
    ]) {
      for (const file of getBetterSqlitePrebuilds(target)) {
        expect(existsSync(path.join(dir, file)), file).toBe(true);
      }
    }
  });
});
