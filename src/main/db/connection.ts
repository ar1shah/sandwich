import Database from "better-sqlite3";

export type Db = Database.Database;

export type OpenDatabaseOptions = {
  // Read-only connections (folder inspection) skip the write pragmas and never create the file.
  readonly?: boolean;
};

export function openDatabase(
  file: string,
  { readonly = false }: OpenDatabaseOptions = {},
): Db {
  const db = new Database(file, { readonly, fileMustExist: readonly });
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  if (!readonly) {
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
  }
  return db;
}

// Folds the WAL back into library.db first, so the file is self-contained after quit or
// a library switch (copying library.db alone loses nothing).
export function closeDatabase(db: Db): void {
  if (!db.open) {
    return;
  }
  try {
    if (!db.readonly) {
      db.pragma("wal_checkpoint(TRUNCATE)");
    }
  } finally {
    db.close();
  }
}
