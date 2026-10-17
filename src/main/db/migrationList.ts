import { buildMigrationList } from "../../shared/migrations";

// SQL is bundled into main.js (Vite ?raw), so it works in dev, in the asar and in Vitest.
const files = import.meta.glob("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const MIGRATIONS = buildMigrationList(
  Object.entries(files).map(([filePath, sql]) => ({
    fileName: filePath.split("/").pop() ?? filePath,
    sql,
  })),
);

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
