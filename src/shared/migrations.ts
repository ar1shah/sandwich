// Migration file naming and ordering: NNN_name.sql, applied in version order, no gaps.
// Pure: the runner (src/main/db/migrate.ts) executes them.

export type Migration = {
  version: number;
  name: string;
  sql: string;
  // "off" runs the migration with PRAGMA foreign_keys=OFF set before BEGIN (needed by
  // table-rebuild migrations; the pragma is a no-op inside a transaction). Declared in
  // the SQL file's leading comments as `-- sandwich: foreign_keys=off`.
  foreignKeys: "on" | "off";
};

export type MigrationFile = { fileName: string; sql: string };

const FILE_NAME = /^(\d{3})_([a-z0-9_]+)\.sql$/;
const FOREIGN_KEYS_OFF = /^--\s*sandwich:\s*foreign_keys\s*=\s*off\s*$/i;

export function parseMigrationFileName(
  fileName: string,
): { version: number; name: string } | null {
  const match = FILE_NAME.exec(fileName);
  if (!match) {
    return null;
  }
  const version = Number(match[1]);
  return version >= 1 ? { version, name: match[2] } : null;
}

function readsForeignKeysOff(sql: string): boolean {
  for (const line of sql.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    if (!trimmed.startsWith("--")) {
      return false; // directives live in the leading comment block only
    }
    if (FOREIGN_KEYS_OFF.test(trimmed)) {
      return true;
    }
  }
  return false;
}

// Throws on a bad file name, a duplicate version, or a gap (versions must be 1..N).
export function buildMigrationList(files: MigrationFile[]): Migration[] {
  const migrations: Migration[] = [];
  const seen = new Set<number>();
  for (const { fileName, sql } of files) {
    const parsed = parseMigrationFileName(fileName);
    if (!parsed) {
      throw new Error(
        `Migration file "${fileName}" must be named NNN_name.sql (lowercase, digits, underscores).`,
      );
    }
    if (seen.has(parsed.version)) {
      throw new Error(`Duplicate migration version ${parsed.version}.`);
    }
    seen.add(parsed.version);
    migrations.push({
      ...parsed,
      sql,
      foreignKeys: readsForeignKeysOff(sql) ? "off" : "on",
    });
  }
  migrations.sort((a, b) => a.version - b.version);
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migration versions must be contiguous from 001: expected ${String(index + 1).padStart(3, "0")}, found ${String(migration.version).padStart(3, "0")}.`,
      );
    }
  });
  return migrations;
}
