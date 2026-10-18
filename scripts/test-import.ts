// npm run test:import: pushes every fixture (and every clip in fixtures/real/) through the
// real job queue and importClip flow with real ffmpeg, into a throwaway library under
// out/import-test/, and asserts:
//   1. never more than 2 imports run at once, and 2 really do run together
//   2. every job ends done, with one media row and all three files per clip
//   3. a batch cancelled mid-flight leaves no partial files, no staging folder and no
//      orphan rows (the library on disk matches the rows exactly)
//   4. the originals are byte-for-byte untouched
// Needs npm run fixtures first. No Electron.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { closeDatabase, openDatabase } from "../src/main/db/connection";
import { runMigrations } from "../src/main/db/migrate";
import { createRepos } from "../src/main/db/repos";
import { toAbsolute } from "../src/main/db/libraryPaths";
import { createJobService } from "../src/main/jobs";
import { sweepLibrary } from "../src/main/library/sweepLibrary";
import { LIBRARY_DB_FILE, LIBRARY_DIRS } from "../src/shared/library";
import { buildMigrationList } from "../src/shared/migrations";
import {
  hasImportExtension,
  importedMediaId,
  isTerminalJobState,
  type JobEvent,
} from "../src/shared/jobs";

const FIXTURES_DIR = path.resolve("fixtures");
const OUT_DIR = path.resolve("out", "import-test");
const MAX_CONCURRENT = 2;

const failures: string[] = [];
function check(ok: boolean, label: string, detail = ""): void {
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`,
  );
  if (!ok) {
    failures.push(label);
  }
}

function listVideos(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter(hasImportExtension)
    .sort()
    .map((file) => path.join(dir, file));
}

function hashOf(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// Every file under the library except the database files.
function filesOnDisk(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(root, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .filter((rel) => !rel.startsWith("library.db"))
    .sort();
}

// migrationList.ts uses Vite's import.meta.glob, which tsx cannot run, so read the same
// files directly.
function loadMigrations() {
  const dir = path.resolve("src", "main", "db", "migrations");
  return buildMigrationList(
    readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .map((fileName) => ({
        fileName,
        sql: readFileSync(path.join(dir, fileName), "utf8"),
      })),
  );
}

// What openLibrary() does, minus the Vite-only migration list.
async function openTestLibrary(root: string) {
  for (const dir of LIBRARY_DIRS) {
    await mkdir(path.join(root, ...dir.split("/")), { recursive: true });
  }
  const db = openDatabase(path.join(root, LIBRARY_DB_FILE));
  await runMigrations(db, loadMigrations());
  return { db, repos: createRepos(db) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const clips = [
    ...listVideos(FIXTURES_DIR),
    ...listVideos(path.join(FIXTURES_DIR, "real")),
  ];
  if (clips.length < 4) {
    throw new Error(
      "Need at least 4 clips in fixtures/. Run npm run fixtures first.",
    );
  }
  const originalHashes = new Map(clips.map((clip) => [clip, hashOf(clip)]));

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const root = path.join(OUT_DIR, "Library");
  const library = await openTestLibrary(root);
  await sweepLibrary(root);

  let running = 0;
  let peak = 0;
  const events: JobEvent[] = [];
  const service = createJobService({
    getLibrary: () => ({ root, repos: library.repos }),
    onEvent: (event) => {
      events.push(event);
      if (event.type === "started") {
        running++;
        peak = Math.max(peak, running);
      } else if (isTerminalJobState(event.job.state)) {
        running--;
      }
    },
  });

  const consistent = (label: string): void => {
    const rows = library.repos.media.list();
    const expected = rows
      .flatMap((m) => [m.path, m.thumbPath, m.filmstripPath])
      .filter((p): p is string => p !== null)
      .sort();
    const onDisk = filesOnDisk(root);
    check(
      JSON.stringify(expected) === JSON.stringify(onDisk),
      `${label}: library files match the media rows exactly`,
      `${rows.length} rows, ${onDisk.length} files`,
    );
    check(
      !existsSync(path.join(root, "cache", "tmp")) ||
        readdirSync(path.join(root, "cache", "tmp")).length === 0,
      `${label}: cache/tmp is empty`,
    );
  };

  // 1 + 2: full batch.
  console.log(`\nBatch 1: importing ${clips.length} clips`);
  const started = Date.now();
  const ids = service.importUgc(clips);
  check(
    ids.length === clips.length &&
      events.filter((e) => e.type === "queued").length === clips.length,
    "every clip is announced as queued immediately",
  );
  while (service.hasActive()) {
    await sleep(100);
  }
  console.log(`  took ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const done = events.filter((e) => e.type === "done");
  const failed = events.filter((e) => e.type === "failed");
  for (const f of failed) {
    console.log(`  failed: ${f.job.label}: ${f.job.error}`);
  }
  check(
    failed.length === 0 && done.length === clips.length,
    "all jobs done",
    `${done.length}/${clips.length}`,
  );
  check(
    peak === MAX_CONCURRENT,
    `concurrency peaked at exactly ${MAX_CONCURRENT}`,
    `peak ${peak}`,
  );
  const rows = library.repos.media.list();
  check(
    rows.length === clips.length,
    "one media row per clip",
    `${rows.length}`,
  );
  check(
    rows.every((m) =>
      [m.path, m.thumbPath, m.filmstripPath].every(
        (p) => p && existsSync(toAbsolute(root, p)),
      ),
    ),
    "every row's mp4, thumbnail and filmstrip exist",
  );
  check(
    done.every(
      (e) =>
        e.job.result &&
        rows.some((m) => m.id === importedMediaId(e.job.result)),
    ),
    "done events carry a mediaId that exists",
  );
  consistent("after batch 1");
  const filesAfterBatch1 = filesOnDisk(root);

  // 3: cancel mid-flight.
  console.log("\nBatch 2: cancel while running");
  events.length = 0;
  service.importUgc(clips);
  while (!events.some((e) => e.type === "progress" && e.job.percent > 0)) {
    await sleep(20);
  }
  const t0 = Date.now();
  await service.cancelAll();
  console.log(`  cancelAll took ${Date.now() - t0} ms`);
  check(!service.hasActive(), "nothing active after cancelAll");
  const cancelled = events.filter((e) => e.type === "cancelled").length;
  const finishedBeforeCancel = events.filter((e) => e.type === "done").length;
  check(
    cancelled > 0,
    "some jobs were cancelled",
    `${cancelled} cancelled, ${finishedBeforeCancel} finished first`,
  );
  check(
    events.every((e) => e.type !== "failed"),
    "no job reported failed because of the cancel",
  );
  const rowsNow = library.repos.media.list();
  check(
    rowsNow.length === clips.length + finishedBeforeCancel,
    "rows = batch 1 + jobs that finished before the cancel",
    `${rowsNow.length}`,
  );
  consistent("after cancel");
  check(
    filesAfterBatch1.every((f) => filesOnDisk(root).includes(f)),
    "batch 1's files are still there",
  );

  // Crash recovery: leftovers from a killed run are swept.
  await mkdir(path.join(root, "cache", "tmp", "dead-job"), { recursive: true });
  await sweepLibrary(root);
  check(
    !existsSync(path.join(root, "cache", "tmp", "dead-job")),
    "sweepLibrary removes leftover staging",
  );

  // 4: originals untouched.
  check(
    clips.every((clip) => hashOf(clip) === originalHashes.get(clip)),
    "originals are byte-for-byte unchanged",
  );

  closeDatabase(library.db);
  console.log(
    failures.length === 0
      ? "\nAll import checks passed."
      : `\n${failures.length} check(s) FAILED.`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(
    `[test:import] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exit(1);
});
