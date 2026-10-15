import path from "node:path";

// Platforms we ship FFmpeg for. Windows is built later (Step 5.1) but resolves today.
export const FF_TARGETS = ["darwin-arm64", "darwin-x64", "win32-x64"] as const;
export type FfTarget = (typeof FF_TARGETS)[number];
export type FfTool = "ffmpeg" | "ffprobe";

// Folder (inside the app, unpacked from asar) that holds the binaries in packaged builds.
export const PACKAGED_FF_DIR = "ffmpeg-bin";

export function getFfTarget(platform: string, arch: string): FfTarget | null {
  const target = `${platform}-${arch}`;
  return (FF_TARGETS as readonly string[]).includes(target)
    ? (target as FfTarget)
    : null;
}

export function getFfBinaryName(tool: FfTool, platform: string): string {
  return platform === "win32" ? `${tool}.exe` : tool;
}

export function getVendorFfDir(projectRoot: string, target: FfTarget): string {
  return path.join(projectRoot, "vendor", "ffmpeg", target);
}

export type FfPaths = {
  ffmpeg: string;
  ffprobe: string;
};

export function resolveFfPaths({
  isPackaged,
  appPath,
  resourcesPath,
  platform,
  arch,
}: {
  isPackaged: boolean;
  // Dev: the project root. Packaged: ignored.
  appPath: string;
  // Packaged: process.resourcesPath. Dev: ignored.
  resourcesPath: string;
  platform: string;
  arch: string;
}): FfPaths {
  const target = getFfTarget(platform, arch);
  if (!target) {
    throw new Error(`No bundled FFmpeg for ${platform}-${arch}.`);
  }

  // Packaged binaries live in app.asar.unpacked, never inside app.asar.
  const dir = isPackaged
    ? path.join(resourcesPath, "app.asar.unpacked", PACKAGED_FF_DIR, target)
    : getVendorFfDir(appPath, target);

  return {
    ffmpeg: path.join(dir, getFfBinaryName("ffmpeg", platform)),
    ffprobe: path.join(dir, getFfBinaryName("ffprobe", platform)),
  };
}
