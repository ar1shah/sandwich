import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolveInside, resolveInsideReal } from "../src/main/media/pathGuard";

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

  it("compares case-insensitively", () => {
    expect(guard("..\\MEDIA\\clip.mp4")).toBe("C:\\MEDIA\\clip.mp4");
    expect(guard("..\\MEDIA-EVIL\\clip.mp4")).toBeNull();
  });
});

describe("resolveInsideReal (real filesystem)", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pathguard-"));
  const root = path.join(base, "root");
  const outside = path.join(base, "outside");
  mkdirSync(path.join(root, "sub"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(path.join(root, "sub", "clip.mp4"), "x");
  writeFileSync(path.join(outside, "secret.txt"), "secret");
  symlinkSync(outside, path.join(root, "escape"));
  symlinkSync(path.join(outside, "secret.txt"), path.join(root, "link.txt"));
  symlinkSync(path.join(root, "sub"), path.join(root, "inner-link"));
  const rootViaLink = path.join(base, "root-link");
  symlinkSync(root, rootViaLink);

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it("resolves files inside the root", async () => {
    const result = await resolveInsideReal(root, ["sub", "clip.mp4"]);
    expect(result.kind).toBe("ok");
  });

  it("works when the root itself is reached through a symlink", async () => {
    const result = await resolveInsideReal(rootViaLink, ["sub", "clip.mp4"]);
    expect(result.kind).toBe("ok");
  });

  it("allows a symlink that stays inside the root", async () => {
    const result = await resolveInsideReal(root, ["inner-link", "clip.mp4"]);
    expect(result.kind).toBe("ok");
  });

  it("rejects symlinks that leave the root", async () => {
    expect((await resolveInsideReal(root, ["escape", "secret.txt"])).kind).toBe(
      "outside",
    );
    expect((await resolveInsideReal(root, ["link.txt"])).kind).toBe("outside");
  });

  it("rejects traversal and reports missing files", async () => {
    expect((await resolveInsideReal(root, ["..", "outside"])).kind).toBe(
      "outside",
    );
    expect((await resolveInsideReal(root, ["nope.mp4"])).kind).toBe("missing");
  });

  it("reports a missing root", async () => {
    const result = await resolveInsideReal(path.join(base, "gone"), ["a"]);
    expect(result.kind).toBe("no-root");
  });
});
