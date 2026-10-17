import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { closeDatabase, openDatabase } from "../src/main/db/connection";
import {
  ForeignKeyViolationError,
  SchemaTooNewError,
} from "../src/main/db/errors";
import {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
} from "../src/main/db/migrationList";
import { runMigrations } from "../src/main/db/migrate";
import { buildMigrationList } from "../src/shared/migrations";
import { makeTempDir, trackDb } from "./helpers/db";

function open(dir: string) {
  return trackDb(openDatabase(path.join(dir, "library.db")));
}

const m = (fileName: string, sql: string) => ({ fileName, sql });

describe("bundled migrations", () => {
  it("loads 001_init and is contiguous", () => {
    expect(MIGRATIONS[0]).toMatchObject({ version: 1, name: "init" });
    expect(LATEST_SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });
});

describe("openDatabase", () => {
  it("uses WAL, synchronous=NORMAL and enforces foreign keys", () => {
    const db = open(makeTempDir());
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("synchronous", { simple: true })).toBe(1); // NORMAL
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("closeDatabase checkpoints the WAL so library.db is self-contained", async () => {
    const dir = makeTempDir();
    const db = open(dir);
    await runMigrations(db, MIGRATIONS);
    db.prepare(
      "INSERT INTO products (id, full_name, slug, created_at, updated_at) VALUES ('p','P','p','t','t')",
    ).run();
    closeDatabase(db);
    // After TRUNCATE-checkpoint + close, SQLite removes the -wal file or leaves it empty.
    const wal = path.join(dir, "library.db-wal");
    expect(!existsSync(wal) || statSync(wal).size === 0).toBe(true);
    const reopened = open(dir);
    expect(
      reopened.prepare("SELECT COUNT(*) AS n FROM products").get(),
    ).toEqual({ n: 1 });
  });
});

describe("runMigrations", () => {
  it("applies once, records schema_migrations, and is idempotent", async () => {
    const db = open(makeTempDir());
    const first = await runMigrations(db, MIGRATIONS);
    expect(first).toMatchObject({
      fromVersion: 0,
      applied: [1],
      backupPath: null,
    });
    const rows = db
      .prepare("SELECT version, name FROM schema_migrations")
      .all();
    expect(rows).toEqual([{ version: 1, name: "init" }]);

    const second = await runMigrations(db, MIGRATIONS);
    expect(second.applied).toEqual([]);
  });

  it("rolls a failing migration back completely and keeps earlier ones", async () => {
    const db = open(makeTempDir());
    const list = buildMigrationList([
      m("001_a.sql", "CREATE TABLE a (x INTEGER);"),
      m(
        "002_bad.sql",
        "CREATE TABLE b (x INTEGER); INSERT INTO nope VALUES (1);",
      ),
    ]);
    await expect(runMigrations(db, list)).rejects.toThrow(/no such table/);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain("a");
    expect(tables).not.toContain("b");
    expect(
      db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get(),
    ).toEqual({ v: 1 });
  });

  it("refuses a database written by a newer app", async () => {
    const db = open(makeTempDir());
    await runMigrations(db, MIGRATIONS);
    db.prepare(
      "INSERT INTO schema_migrations VALUES (99, 'future', 't')",
    ).run();
    await expect(runMigrations(db, MIGRATIONS)).rejects.toBeInstanceOf(
      SchemaTooNewError,
    );
  });

  it("backs up an existing non-empty database before migrating, not a fresh one", async () => {
    const dir = makeTempDir();
    const db = open(dir);
    const v1 = buildMigrationList([
      m("001_a.sql", "CREATE TABLE a (x INTEGER);"),
    ]);
    const fresh = await runMigrations(db, v1);
    expect(fresh.backupPath).toBeNull();
    expect(readdirSync(dir).some((f) => f.includes(".bak-"))).toBe(false);

    db.exec("INSERT INTO a VALUES (7)");
    const v2 = buildMigrationList([
      m("001_a.sql", "CREATE TABLE a (x INTEGER);"),
      m("002_b.sql", "CREATE TABLE b (y INTEGER);"),
    ]);
    const result = await runMigrations(db, v2);
    expect(result.backupPath).toBe(path.join(dir, "library.db.bak-v1"));

    const backup = trackDb(
      openDatabase(result.backupPath!, { readonly: true }),
    );
    expect(backup.prepare("SELECT x FROM a").all()).toEqual([{ x: 7 }]);
    expect(
      backup.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").all(),
    ).toEqual([]); // the backup is the pre-migration state
  });

  it("keeps only the newest 3 backups", async () => {
    const dir = makeTempDir();
    const db = open(dir);
    const files = Array.from({ length: 5 }, (_, i) =>
      m(`00${i + 1}_t${i + 1}.sql`, `CREATE TABLE t${i + 1} (x INTEGER);`),
    );
    await runMigrations(db, buildMigrationList(files.slice(0, 1)));
    // Pre-seed stale backups with old mtimes.
    for (const [i, name] of [
      "library.db.bak-v90",
      "library.db.bak-v91",
      "library.db.bak-v92",
    ].entries()) {
      const file = path.join(dir, name);
      writeFileSync(file, "x");
      const old = new Date(2020, 0, 1 + i);
      utimesSync(file, old, old);
    }
    await runMigrations(db, buildMigrationList(files.slice(0, 2)));
    const backups = readdirSync(dir)
      .filter((f) => f.includes(".bak-v"))
      .sort();
    expect(backups).toEqual([
      "library.db.bak-v1",
      "library.db.bak-v91",
      "library.db.bak-v92",
    ]);
  });

  it("a failed backup aborts the migration", async () => {
    const dir = makeTempDir();
    const db = open(dir);
    const v1 = buildMigrationList([
      m("001_a.sql", "CREATE TABLE a (x INTEGER);"),
    ]);
    await runMigrations(db, v1);
    // A directory where the backup file must go makes db.backup fail.
    mkdirSync(path.join(dir, "library.db.bak-v1"));
    const v2 = buildMigrationList([
      m("001_a.sql", "CREATE TABLE a (x INTEGER);"),
      m("002_b.sql", "CREATE TABLE b (y INTEGER);"),
    ]);
    await expect(runMigrations(db, v2)).rejects.toThrow();
    expect(
      db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get(),
    ).toEqual({ v: 1 });
  });

  it("fails loudly when foreign_key_check finds orphans", async () => {
    const db = open(makeTempDir());
    db.pragma("foreign_keys = OFF");
    const list = buildMigrationList([
      m(
        "001_a.sql",
        `CREATE TABLE parent (id INTEGER PRIMARY KEY);
         CREATE TABLE child (id INTEGER PRIMARY KEY, p INTEGER REFERENCES parent(id));
         INSERT INTO child VALUES (1, 42);`,
      ),
    ]);
    await expect(runMigrations(db, list)).rejects.toBeInstanceOf(
      ForeignKeyViolationError,
    );
  });

  describe("foreign_keys=off directive", () => {
    const base = m(
      "001_a.sql",
      `CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT);
       CREATE TABLE child (id INTEGER PRIMARY KEY, p INTEGER REFERENCES parent(id) ON DELETE CASCADE);
       INSERT INTO parent VALUES (1, 'a');
       INSERT INTO child VALUES (10, 1);`,
    );
    // SQLite's documented rebuild order: create new, copy, drop old, rename new. (Renaming the
    // old table first would rewrite the children's references to the renamed table.)
    const rebuild = `CREATE TABLE parent_new (id INTEGER PRIMARY KEY, name TEXT, extra TEXT);
       INSERT INTO parent_new (id, name) SELECT id, name FROM parent;
       DROP TABLE parent;
       ALTER TABLE parent_new RENAME TO parent;`;

    it("a table rebuild keeps child rows when the directive is set, and turns FKs back on", async () => {
      const db = open(makeTempDir());
      await runMigrations(db, buildMigrationList([base]));
      await runMigrations(
        db,
        buildMigrationList([
          base,
          m("002_rebuild.sql", `-- sandwich: foreign_keys=off\n${rebuild}`),
        ]),
      );
      expect(db.prepare("SELECT COUNT(*) AS n FROM child").get()).toEqual({
        n: 1,
      });
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    });

    it("the same rebuild without the directive loses the cascaded child rows", async () => {
      const db = open(makeTempDir());
      await runMigrations(db, buildMigrationList([base]));
      await runMigrations(
        db,
        buildMigrationList([base, m("002_rebuild.sql", rebuild)]),
      );
      expect(db.prepare("SELECT COUNT(*) AS n FROM child").get()).toEqual({
        n: 0,
      });
    });

    it("a rebuild that leaves orphans is rolled back before commit and FKs are restored", async () => {
      const db = open(makeTempDir());
      await runMigrations(db, buildMigrationList([base]));
      const bad = m(
        "002_bad.sql",
        `-- sandwich: foreign_keys=off\nDELETE FROM parent;`,
      );
      await expect(
        runMigrations(db, buildMigrationList([base, bad])),
      ).rejects.toBeInstanceOf(ForeignKeyViolationError);
      expect(db.prepare("SELECT COUNT(*) AS n FROM parent").get()).toEqual({
        n: 1,
      });
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    });
  });
});
