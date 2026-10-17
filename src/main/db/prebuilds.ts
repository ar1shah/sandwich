// better-sqlite3 13 ships N-API prebuilds in its package (prebuilds/<platform>-<arch>.node),
// so there is no electron-rebuild step (DECISIONS #28). Packaging copies only the files
// for the target. "universal" is the macOS universal build (both architectures).
export function getBetterSqlitePrebuilds({
  arch,
  platform,
}: {
  arch: string;
  platform: string;
}): string[] {
  if (platform === "darwin" && arch === "universal") {
    return ["darwin-arm64.node", "darwin-x64.node"];
  }
  const supported: Record<string, string[]> = {
    darwin: ["arm64", "x64"],
    win32: ["arm64", "x64"],
    linux: ["arm64", "x64"],
  };
  if (!supported[platform]?.includes(arch)) {
    throw new Error(`No better-sqlite3 prebuild for ${platform}-${arch}.`);
  }
  return [`${platform}-${arch}.node`];
}
