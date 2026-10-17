import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import {
  closeDatabase,
  openDatabase,
  type Db,
} from "../../src/main/db/connection";
import { MIGRATIONS } from "../../src/main/db/migrationList";
import { runMigrations } from "../../src/main/db/migrate";
import { createRepos } from "../../src/main/db/repos";

const dirs: string[] = [];
const dbs: Db[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) {
    closeDatabase(db);
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

export function makeTempDir(prefix = "sandwich-test-"): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

export function trackDb(db: Db): Db {
  dbs.push(db);
  return db;
}

// A migrated library.db in a fresh temp dir, with stable ids and timestamps.
export async function makeTempLibraryDb() {
  const root = makeTempDir();
  const file = path.join(root, "library.db");
  const db = trackDb(openDatabase(file));
  await runMigrations(db, MIGRATIONS);
  let counter = 0;
  let tick = 0;
  const repos = createRepos(db, {
    newId: () => `id-${++counter}`,
    now: () => new Date(Date.UTC(2026, 9, 17, 0, 0, tick++)).toISOString(),
  });
  return { root, file, db, repos };
}
