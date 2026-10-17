import { describe, expect, it } from "vitest";
import { detectSyncProvider } from "../src/shared/syncedFolders";

describe("detectSyncProvider", () => {
  it.each([
    ["/Users/a/Dropbox/SandwichLibrary", "dropbox"],
    ["/Users/a/Dropbox (Personal)/Lib", "dropbox"],
    ["/Users/a/Library/CloudStorage/Dropbox/Lib", "dropbox"],
    ["/Users/a/Google Drive/My Drive/Lib", "google-drive"],
    [
      "/Users/a/Library/CloudStorage/GoogleDrive-me@mail.com/My Drive/Lib",
      "google-drive",
    ],
    ["G:\\My Drive\\Lib", "google-drive"],
    ["/Users/a/OneDrive/Lib", "onedrive"],
    ["/Users/a/OneDrive - Acme Inc/Lib", "onedrive"],
    ["C:\\Users\\a\\OneDrive-Acme\\Videos", "onedrive"],
    ["/Users/a/Library/Mobile Documents/com~apple~CloudDocs/Lib", "icloud"],
    ["/Users/a/iCloud Drive/Lib", "icloud"],
  ])("flags %s as %s", (input, provider) => {
    expect(detectSyncProvider(input)).toBe(provider);
  });

  it("is case-insensitive", () => {
    expect(detectSyncProvider("/Users/a/DROPBOX/x")).toBe("dropbox");
  });

  it.each([
    "/Users/a/Movies/SandwichLibrary",
    "/Users/a/dropbox-backup/Lib",
    "/Users/a/Documents/onedrivers",
    "C:\\Users\\a\\Videos\\SandwichLibrary",
    "",
  ])("does not flag %s", (input) => {
    expect(detectSyncProvider(input)).toBeNull();
  });
});
