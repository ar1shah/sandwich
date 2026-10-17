import { readdir, realpath, access } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_LIBRARY_FOLDER_NAME,
  LIBRARY_DB_FILE,
  type LibraryCandidate,
} from "../../shared/library";
import { detectSyncProvider } from "../../shared/syncedFolders";
import { closeDatabase, openDatabase } from "../db/connection";
import { LATEST_SCHEMA_VERSION } from "../db/migrationList";

// Files that do not make a folder "non-empty" (the OS drops them in on its own).
const IGNORABLE = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

// realpath of the deepest existing ancestor plus the not-yet-created remainder, so a
// folder we are about to create still resolves symlinks on the way to it.
async function realpathLoose(target: string): Promise<string> {
  const resolved = path.resolve(target);
  try {
    return await realpath(resolved);
  } catch {
    const parent = path.dirname(resolved);
    if (parent === resolved) {
      return resolved;
    }
    return path.join(await realpathLoose(parent), path.basename(resolved));
  }
}

export async function syncProviderOf(target: string) {
  return detectSyncProvider(await realpathLoose(target));
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

// Read-only: compares the highest applied migration with what this app knows. Nothing
// is migrated or backed up. An unreadable database is not "too new" (activate reports it).
function readsAsNewerSchema(dbFile: string): boolean {
  try {
    const db = openDatabase(dbFile, { readonly: true });
    try {
      const row = db
        .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations")
        .get() as { v: number };
      return row.v > LATEST_SCHEMA_VERSION;
    } finally {
      closeDatabase(db);
    }
  } catch {
    return false;
  }
}

async function inspectPath(
  target: string,
): Promise<Omit<LibraryCandidate, "createsSubfolder" | "chosenPath">> {
  const absolute = path.resolve(target);
  const real = await realpathLoose(absolute);
  const dbFile = path.join(real, LIBRARY_DB_FILE);
  const isExistingLibrary = await exists(dbFile);
  const entries = await readdir(real).catch(() => [] as string[]);
  return {
    path: absolute,
    syncProvider: detectSyncProvider(real),
    isExistingLibrary,
    isEmpty: entries.filter((name) => !IGNORABLE.has(name)).length === 0,
    schemaTooNew: isExistingLibrary && readsAsNewerSchema(dbFile),
  };
}

// What a folder looks like as a library root. A folder the user picked that already has
// other files and is not a library gets a SandwichLibrary subfolder proposed instead of
// scattering products/, clips/ and library.db into it (allowSubfolder; not for the default path).
export async function inspectFolder(
  chosen: string,
  { allowSubfolder }: { allowSubfolder: boolean },
): Promise<LibraryCandidate> {
  const direct = await inspectPath(chosen);
  if (allowSubfolder && !direct.isExistingLibrary && !direct.isEmpty) {
    const child = await inspectPath(
      path.join(path.resolve(chosen), DEFAULT_LIBRARY_FOLDER_NAME),
    );
    return { ...child, createsSubfolder: true, chosenPath: direct.path };
  }
  return { ...direct, createsSubfolder: false, chosenPath: null };
}
