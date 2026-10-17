import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { LIBRARY_DB_FILE, LIBRARY_DIRS } from "../../shared/library";
import { closeDatabase, openDatabase, type Db } from "../db/connection";
import { MIGRATIONS } from "../db/migrationList";
import { runMigrations, type MigrateResult } from "../db/migrate";
import { createRepos, type Repos } from "../db/repos";

export type OpenLibrary = {
  root: string;
  db: Db;
  repos: Repos;
  migration: MigrateResult;
};

export class LibraryNotFoundError extends Error {
  constructor(readonly root: string) {
    super(
      `The library folder "${root}" or its ${LIBRARY_DB_FILE} was not found. Is the drive connected?`,
    );
    this.name = "LibraryNotFoundError";
  }
}

export async function ensureLayout(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  for (const dir of LIBRARY_DIRS) {
    await mkdir(path.join(root, ...dir.split("/")), { recursive: true });
  }
}

// Creates the folder layout and library.db when missing, opens the database and brings
// the schema up to date. With mustExist (re-opening a saved library) a missing folder or
// database is an error instead of silently creating an empty library in its place.
export async function openLibrary(
  root: string,
  { mustExist = false }: { mustExist?: boolean } = {},
): Promise<OpenLibrary> {
  const dbFile = path.join(root, LIBRARY_DB_FILE);
  if (mustExist) {
    await access(dbFile).catch(() => {
      throw new LibraryNotFoundError(root);
    });
  }
  await ensureLayout(root);
  const db = openDatabase(dbFile);
  try {
    const migration = await runMigrations(db, MIGRATIONS);
    return { root, db, repos: createRepos(db), migration };
  } catch (error) {
    closeDatabase(db);
    throw error;
  }
}
