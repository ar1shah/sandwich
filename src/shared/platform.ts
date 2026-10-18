// Wording that depends on the operating system. `platform` is process.platform of the app.

// "Show in Finder" on macOS, "Show in Explorer" on Windows (CLAUDE.md golden rule 3).
export function fileManagerName(platform: string): string {
  if (platform === "darwin") {
    return "Finder";
  }
  if (platform === "win32") {
    return "Explorer";
  }
  return "file manager";
}

export function showInFileManagerLabel(platform: string): string {
  return `Show in ${fileManagerName(platform)}`;
}
