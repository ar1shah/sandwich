// Detects folders managed by a cloud sync client. SQLite databases can corrupt when a
// sync client rewrites the file under an open connection, so the library picker warns
// (it never blocks). A path heuristic only: it cannot see a synced Desktop or Documents.

export type SyncProvider = "dropbox" | "google-drive" | "onedrive" | "icloud";

export const SYNC_PROVIDER_LABELS: Record<SyncProvider, string> = {
  dropbox: "Dropbox",
  "google-drive": "Google Drive",
  onedrive: "OneDrive",
  icloud: "iCloud Drive",
};

function providerForSegment(segment: string): SyncProvider | null {
  const name = segment.toLowerCase();
  // "Dropbox", "Dropbox (Personal)", "Dropbox (Team Name)"
  if (name === "dropbox" || name.startsWith("dropbox ")) {
    return "dropbox";
  }
  // "Google Drive", "GoogleDrive", "GoogleDrive-name@mail.com", "My Drive"
  if (
    name === "google drive" ||
    name.startsWith("google drive ") ||
    name === "googledrive" ||
    name.startsWith("googledrive-") ||
    name === "my drive"
  ) {
    return "google-drive";
  }
  // "OneDrive", "OneDrive - Company", "OneDrive-Company"
  if (
    name === "onedrive" ||
    name.startsWith("onedrive ") ||
    name.startsWith("onedrive-")
  ) {
    return "onedrive";
  }
  // "iCloud Drive", the macOS container "com~apple~CloudDocs" and "Mobile Documents"
  if (
    name === "icloud drive" ||
    name === "icloud" ||
    name === "com~apple~clouddocs" ||
    name === "mobile documents"
  ) {
    return "icloud";
  }
  return null;
}

// Works on posix and Windows paths. The caller should pass a realpath so a symlink into
// a synced folder is caught.
export function detectSyncProvider(absPath: string): SyncProvider | null {
  for (const segment of absPath.split(/[\\/]+/)) {
    const provider = providerForSegment(segment);
    if (provider) {
      return provider;
    }
  }
  return null;
}
