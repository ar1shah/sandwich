// Library folder and database types shared by main, preload and renderer (ARCHITECTURE
// sections 3 and 4). Types, constants and zod schemas only: no Node or DOM imports.
import { z } from "zod";
import type { SyncProvider } from "./syncedFolders";

export const LIBRARY_DB_FILE = "library.db";
export const DEFAULT_LIBRARY_FOLDER_NAME = "SandwichLibrary";

// Folders created inside a library root (ARCHITECTURE section 3). Forward slashes.
export const LIBRARY_DIRS = [
  "products",
  "clips",
  "cache/filmstrips",
  "cache/tmp",
  "exports",
] as const;

export const MEDIA_KINDS = ["ugc", "broll", "image"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const CAPTION_SLOTS = ["before", "after", "broll", "any"] as const;
export type CaptionSlot = (typeof CAPTION_SLOTS)[number];

export const VIDEO_STATUSES = ["draft", "exported", "failed"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

// Rows as the app sees them: camelCase, booleans as booleans, paths library-relative.
export type Product = {
  id: string;
  fullName: string;
  shortName: string | null;
  slug: string;
  imagePath: string | null;
  lastUsedAt: string | null;
  // Set = archived: hidden from pickers, videos and history kept.
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Media = {
  id: string;
  kind: MediaKind;
  productId: string | null;
  path: string;
  thumbPath: string | null;
  filmstripPath: string | null;
  originalName: string | null;
  duration: number;
  width: number;
  height: number;
  recordedAt: string | null;
  wasHdr: boolean;
  createdAt: string;
};

export type Caption = {
  id: string;
  text: string;
  slot: CaptionSlot;
  productId: string | null;
  useCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Video = {
  id: string;
  productId: string;
  status: VideoStatus;
  recipeJson: string;
  exportPath: string | null;
  batchId: string | null;
  createdAt: string;
  updatedAt: string;
};

// What a library folder looks like before it is opened (shown between choose and activate).
export type LibraryCandidate = {
  // The folder that will become the library root (the chosen folder, or its
  // SandwichLibrary subfolder when createsSubfolder is true).
  path: string;
  syncProvider: SyncProvider | null;
  isExistingLibrary: boolean;
  isEmpty: boolean;
  // An existing library written by a newer app version: it cannot be opened.
  schemaTooNew: boolean;
  // The chosen folder was non-empty and not a library, so a SandwichLibrary
  // subfolder is proposed instead of using it directly.
  createsSubfolder: boolean;
  // Only set when createsSubfolder: the folder the user picked, for "use it directly".
  chosenPath: string | null;
};

export type LibraryState =
  | { status: "unconfigured"; defaultPath: string }
  | { status: "ready"; path: string; syncProvider: SyncProvider | null }
  | { status: "error"; path: string; message: string; defaultPath: string };

export const LIBRARY_CHOOSE_SOURCES = ["dialog", "default"] as const;
export const LibraryChooseSourceSchema = z.enum(LIBRARY_CHOOSE_SOURCES);
export type LibraryChooseSource = z.infer<typeof LibraryChooseSourceSchema>;

// Only meaningful with createsSubfolder candidates: use the chosen folder itself.
export const LibraryActivateOptionsSchema = z
  .object({ useChosenFolder: z.boolean().optional() })
  .optional();
export type LibraryActivateOptions = z.infer<
  typeof LibraryActivateOptionsSchema
>;

// <userData>/settings.json
export const AppSettingsSchema = z.object({
  libraryPath: z.string().min(1).optional(),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;
