import { readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { Migration } from "../../shared/migrations";
import type { Db } from "./connection";
import { ForeignKeyViolationError, SchemaTooNewError } from "./errors";

const BACKUPS_TO_KEEP = 3;
const BACKUP_NAME = /\.bak-v\d+$/;

export type MigrateResult = {
  fromVersion: number;
  toVersion: number;
  applied: number[];
  backupPath: string | null;
};

function currentVersion(db: Db): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations")
    .get() as { v: number };
  return row.v;
}

export function assertForeignKeysIntact(db: Db): void {
  const violations = db.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new ForeignKeyViolationError(violations);
  }
}

// Keeps the newest BACKUPS_TO_KEEP backups of this database file (by modified time).
function pruneBackups(dbFile: string): void {
  const dir = path.dirname(dbFile);
  const prefix = path.basename(dbFile);
  const backups = readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && BACKUP_NAME.test(name))
    .map((name) => ({
      file: path.join(dir, name),
      mtime: statSync(path.join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const stale of backups.slice(BACKUPS_TO_KEEP)) {
    unlinkSync(stale.file);
  }
}

// Applies pending migrations in version order, each in its own transaction.
// Before touching an existing, non-empty database it writes <db>.bak-v<oldVersion>
// (a failed backup aborts the migration). Afterwards PRAGMA foreign_key_check must be clean.
export async function runMigrations(
  db: Db,
  migrations: readonly Migration[],
): Promise<MigrateResult> {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const fromVersion = currentVersion(db);
  const latest =
    migrations.length > 0 ? migrations[migrations.length - 1].version : 0;
  if (fromVersion > latest) {
    throw new SchemaTooNewError(fromVersion, latest);
  }

  const pending = migrations.filter((m) => m.version > fromVersion);
  if (pending.length === 0) {
    return {
      fromVersion,
      toVersion: fromVersion,
      applied: [],
      backupPath: null,
    };
  }

  let backupPath: string | null = null;
  const isFile = db.name !== "" && db.name !== ":memory:";
  if (fromVersion > 0 && isFile) {
    backupPath = `${db.name}.bak-v${fromVersion}`;
    await db.backup(backupPath);
    pruneBackups(db.name);
  }

  const insert = db.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
  );
  const applied: number[] = [];
  for (const migration of pending) {
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      insert.run(migration.version, migration.name, new Date().toISOString());
      if (migration.foreignKeys === "off") {
        // Checked before COMMIT so a bad rebuild rolls back instead of landing.
        assertForeignKeysIntact(db);
      }
    });
    if (migration.foreignKeys === "off") {
      // PRAGMA foreign_keys is a no-op inside a transaction, so it is switched here.
      db.pragma("foreign_keys = OFF");
      try {
        apply();
      } finally {
        db.pragma("foreign_keys = ON");
      }
    } else {
      apply();
    }
    applied.push(migration.version);
  }

  assertForeignKeysIntact(db);
  return { fromVersion, toVersion: currentVersion(db), applied, backupPath };
}
