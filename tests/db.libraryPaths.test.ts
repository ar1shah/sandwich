import path from "node:path";
import { describe, expect, it } from "vitest";
import { toAbsolute, toRelative } from "../src/main/db/libraryPaths";

describe("toAbsolute / toRelative", () => {
  it("round trips on posix", () => {
    const root = "/Users/a/Movies/SandwichLibrary";
    const abs = toAbsolute(root, "products/p1/broll/b1.mp4", path.posix);
    expect(abs).toBe(
      path.posix.join(root, "products", "p1", "broll", "b1.mp4"),
    );
    expect(toRelative(root, abs, path.posix)).toBe("products/p1/broll/b1.mp4");
  });

  it("round trips on win32 and stores forward slashes", () => {
    const root = "C:\\Users\\a\\Videos\\SandwichLibrary";
    const abs = toAbsolute(root, "clips/2026-10/c1.mp4", path.win32);
    expect(abs).toBe(
      "C:\\Users\\a\\Videos\\SandwichLibrary\\clips\\2026-10\\c1.mp4",
    );
    expect(toRelative(root, abs, path.win32)).toBe("clips/2026-10/c1.mp4");
  });

  it("toAbsolute rejects anything that could leave the root", () => {
    for (const bad of [
      "../x",
      "/etc/passwd",
      "a/../../x",
      "C:/x",
      "a\\b",
      "",
    ]) {
      expect(() => toAbsolute("/lib", bad)).toThrow();
    }
  });

  it("toRelative rejects paths outside the root and the root itself", () => {
    expect(() => toRelative("/lib", "/other/x.mp4", path.posix)).toThrow(
      /not inside/,
    );
    expect(() => toRelative("/lib", "/lib", path.posix)).toThrow(/not inside/);
    expect(() => toRelative("/lib", "/lib/../x", path.posix)).toThrow(
      /not inside/,
    );
    expect(() => toRelative("C:\\lib", "D:\\lib\\x.mp4", path.win32)).toThrow(
      /not inside/,
    );
  });
});
