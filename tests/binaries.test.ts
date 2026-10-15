import path from "node:path";
import { describe, expect, it } from "vitest";
import { getFfTarget, resolveFfPaths } from "../src/main/media/binaries";

describe("getFfTarget", () => {
  it("maps supported platforms and rejects others", () => {
    expect(getFfTarget("darwin", "arm64")).toBe("darwin-arm64");
    expect(getFfTarget("darwin", "x64")).toBe("darwin-x64");
    expect(getFfTarget("win32", "x64")).toBe("win32-x64");
    expect(getFfTarget("linux", "x64")).toBeNull();
    expect(getFfTarget("darwin", "universal")).toBeNull();
  });
});

describe("resolveFfPaths", () => {
  it("uses vendor/ in dev", () => {
    const paths = resolveFfPaths({
      isPackaged: false,
      appPath: path.join("repo"),
      resourcesPath: "ignored",
      platform: "darwin",
      arch: "arm64",
    });
    expect(paths.ffmpeg).toBe(
      path.join("repo", "vendor", "ffmpeg", "darwin-arm64", "ffmpeg"),
    );
    expect(paths.ffprobe).toBe(
      path.join("repo", "vendor", "ffmpeg", "darwin-arm64", "ffprobe"),
    );
  });

  it("uses app.asar.unpacked when packaged, with .exe on Windows", () => {
    const paths = resolveFfPaths({
      isPackaged: true,
      appPath: "ignored",
      resourcesPath: path.join("Resources"),
      platform: "win32",
      arch: "x64",
    });
    expect(paths.ffmpeg).toBe(
      path.join(
        "Resources",
        "app.asar.unpacked",
        "ffmpeg-bin",
        "win32-x64",
        "ffmpeg.exe",
      ),
    );
    expect(paths.ffmpeg).not.toContain(`app.asar${path.sep}`);
  });

  it("throws for unsupported platforms", () => {
    expect(() =>
      resolveFfPaths({
        isPackaged: false,
        appPath: "repo",
        resourcesPath: "",
        platform: "linux",
        arch: "x64",
      }),
    ).toThrow("No bundled FFmpeg");
  });
});
