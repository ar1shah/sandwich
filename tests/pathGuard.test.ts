import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInside } from "../src/main/spike/pathGuard";

describe("resolveInside (posix)", () => {
  const root = "/srv/media";
  const guard = (requested: string) =>
    resolveInside(root, requested, path.posix);

  it("resolves a file inside the root", () => {
    expect(guard("clip.mp4")).toBe("/srv/media/clip.mp4");
    expect(guard("sub/clip.mp4")).toBe("/srv/media/sub/clip.mp4");
    expect(guard("sub/../clip.mp4")).toBe("/srv/media/clip.mp4");
  });

  it("rejects traversal", () => {
    expect(guard("../secret.txt")).toBeNull();
    expect(guard("sub/../../secret.txt")).toBeNull();
    expect(guard("..")).toBeNull();
  });

  it("rejects absolute paths outside the root", () => {
    expect(guard("/etc/passwd")).toBeNull();
  });

  it("rejects a sibling that shares the root as a string prefix", () => {
    expect(guard("../media-evil/clip.mp4")).toBeNull();
  });

  it("rejects the root itself and NUL bytes", () => {
    expect(guard("")).toBeNull();
    expect(guard(".")).toBeNull();
    expect(guard("clip.mp4\0.txt")).toBeNull();
  });
});

describe("resolveInside (win32)", () => {
  const root = "C:\\media";
  const guard = (requested: string) =>
    resolveInside(root, requested, path.win32);

  it("resolves a file inside the root", () => {
    expect(guard("clip.mp4")).toBe("C:\\media\\clip.mp4");
    expect(guard("sub\\clip.mp4")).toBe("C:\\media\\sub\\clip.mp4");
  });

  it("rejects traversal with either separator", () => {
    expect(guard("..\\secret.txt")).toBeNull();
    expect(guard("../secret.txt")).toBeNull();
  });

  it("rejects other drives and absolute paths", () => {
    expect(guard("D:\\other\\clip.mp4")).toBeNull();
    expect(guard("\\Windows\\win.ini")).toBeNull();
  });

  it("rejects a sibling that shares the root as a string prefix", () => {
    expect(guard("..\\media-evil\\clip.mp4")).toBeNull();
  });
});
