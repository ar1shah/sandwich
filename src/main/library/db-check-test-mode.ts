import { app } from "electron";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { closeDatabase } from "../db/connection";
import { openLibrary } from "./openLibrary";

// Headless proof that the database works inside the (packaged) app, no UI needed:
//   Sandwich --db-check <abs dir>
// Opens (creating if needed) a library in <dir>, does a write/read round trip, writes
// <dir>/db-check.result.json and exits 0 on success, 1 on failure.
export function getDbCheckTestArgs(
  argv: readonly string[],
): { dir: string } | null {
  const flagIndex = argv.indexOf("--db-check");
  if (flagIndex === -1) {
    return null;
  }
  const dir = argv[flagIndex + 1];
  if (!dir || !path.isAbsolute(dir)) {
    // A packaged app chdirs to userData, so a relative path would silently point elsewhere.
    throw new Error("Usage: --db-check <abs dir>");
  }
  return { dir };
}

export async function runDbCheckTest({ dir }: { dir: string }): Promise<void> {
  const resultPath = path.join(dir, "db-check.result.json");
  try {
    const library = await openLibrary(dir);
    try {
      const created = library.repos.products.create({
        fullName: "DB check product",
        slug: `db-check-${Date.now()}`,
      });
      const roundTrip =
        library.repos.products.get(created.id)?.id === created.id;
      library.repos.products.remove(created.id);
      const summary = {
        ok: roundTrip,
        packaged: app.isPackaged,
        electronVersion: process.versions.electron,
        arch: process.arch,
        sqliteVersion: (
          library.db.prepare("select sqlite_version() as v").get() as {
            v: string;
          }
        ).v,
        journalMode: library.db.pragma("journal_mode", { simple: true }),
        foreignKeys: library.db.pragma("foreign_keys", { simple: true }),
        schemaVersion: library.migration.toVersion,
        error: null,
      };
      await writeFile(resultPath, JSON.stringify(summary, null, 2));
      console.log(JSON.stringify(summary, null, 2));
      closeDatabase(library.db);
      app.exit(summary.ok ? 0 : 1);
    } finally {
      closeDatabase(library.db); // no-op when already closed
    }
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(`[db-check] failed: ${message}`);
    await writeFile(
      resultPath,
      JSON.stringify(
        { ok: false, packaged: app.isPackaged, error: message },
        null,
        2,
      ),
    ).catch(() => undefined);
    app.exit(1);
  }
}
