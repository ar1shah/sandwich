import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { TMP_DIR } from "../../shared/importPaths";

const PARTIAL_SUFFIX = ".partial";
// Folders that can hold stray partial files. Not `exports`: nothing writes `.partial` there
// and a user's own files may live next to exports.
const SWEEP_ROOTS = ["clips", "products", "cache"] as const;

async function removePartials(dir: string, skip: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (full === skip) {
      continue;
    }
    if (entry.isDirectory()) {
      await removePartials(full, skip);
    } else if (entry.name.endsWith(PARTIAL_SUFFIX)) {
      await rm(full, { force: true });
    }
  }
}

// Crash recovery: deletes whatever an interrupted import left behind. Import jobs build
// every output inside cache/tmp/<jobId>/, so emptying cache/tmp covers all of it except
// the tiny window between the final renames and the row insert.
//
// Call it only when no job of this library can be running (app start, after a library
// switch cancelled its jobs). It is deliberately NOT part of openLibrary(): --db-check
// and the scripts open libraries too and must not wipe staging a running app is using.
export async function sweepLibrary(root: string): Promise<void> {
  const tmp = path.join(root, ...TMP_DIR.split("/"));
  const stale = await readdir(tmp).catch(() => [] as string[]);
  for (const name of stale) {
    await rm(path.join(tmp, name), { recursive: true, force: true });
  }
  for (const folder of SWEEP_ROOTS) {
    await removePartials(path.join(root, folder), tmp);
  }
}
