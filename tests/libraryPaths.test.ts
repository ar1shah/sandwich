import { describe, expect, it } from "vitest";
import {
  assertRelativeLibraryPath,
  checkRelativeLibraryPath,
} from "../src/shared/libraryPaths";
import { decodeMediaSegments } from "../src/shared/mediaPath";

describe("checkRelativeLibraryPath", () => {
  it.each([
    "library.db",
    "products/abc/broll/x.mp4",
    "clips/2026-10/c1.jpg",
    "name with spaces/a.mp4",
  ])("accepts %s", (input) => {
    expect(checkRelativeLibraryPath(input)).toEqual({ ok: true, path: input });
  });

  it.each([
    "",
    "/etc/passwd",
    "../x",
    "a/../b",
    "a/./b",
    "a//b",
    "a/",
    "a\\b",
    "C:/x",
    "C:\\x",
    "a/b:stream",
    "a\0b",
  ])("rejects %j", (input) => {
    expect(checkRelativeLibraryPath(input).ok).toBe(false);
  });

  it("assert throws with the path in the message", () => {
    expect(() => assertRelativeLibraryPath("../x", "media path")).toThrow(
      /media path "\.\.\/x"/,
    );
  });

  it("rejects exactly what the media server rejects (single traversal rule)", () => {
    const hostile = ["..", ".", "", "a:b", "a\\b", "a\0b", "C:"];
    for (const segment of hostile) {
      expect(checkRelativeLibraryPath(`ok/${segment}`).ok).toBe(false);
      expect(decodeMediaSegments(["ok", segment]).ok).toBe(false);
    }
    expect(checkRelativeLibraryPath("ok/fine.mp4").ok).toBe(true);
    expect(decodeMediaSegments(["ok", "fine.mp4"]).ok).toBe(true);
  });
});
