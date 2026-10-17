import http from "node:http";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase } from "../src/main/db/connection";
import { LATEST_SCHEMA_VERSION } from "../src/main/db/migrationList";
import { inspectFolder } from "../src/main/library/inspectFolder";
import { createLibraryManager } from "../src/main/library/libraryManager";
import {
  LibraryNotFoundError,
  openLibrary,
} from "../src/main/library/openLibrary";
import { createSettingsStore } from "../src/main/library/settings";
import {
  startMediaServer,
  type MediaServer,
} from "../src/main/media/mediaServer";
import { LIBRARY_DIRS } from "../src/shared/library";
import { makeTempDir } from "./helpers/db";

const opened: Array<{ db: Parameters<typeof closeDatabase>[0] }> = [];
const servers: MediaServer[] = [];

afterEach(async () => {
  for (const lib of opened.splice(0)) {
    closeDatabase(lib.db);
  }
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function open(root: string, options?: { mustExist?: boolean }) {
  const lib = await openLibrary(root, options);
  opened.push(lib);
  return lib;
}

function makeLibraryOnDisk(root: string, extraVersion?: number) {
  return open(root).then((lib) => {
    if (extraVersion !== undefined) {
      lib.db
        .prepare("INSERT INTO schema_migrations VALUES (?, 'future', 't')")
        .run(extraVersion);
    }
    closeDatabase(lib.db);
    return root;
  });
}

describe("settings store", () => {
  it("round trips, merges and survives a missing or corrupt file", async () => {
    const dir = makeTempDir();
    const file = path.join(dir, "nested", "settings.json");
    const store = createSettingsStore(file);
    expect(await store.read()).toEqual({});
    await store.write({ libraryPath: "/a" });
    expect(await store.read()).toEqual({ libraryPath: "/a" });
    expect(existsSync(`${file}.tmp`)).toBe(false);

    writeFileSync(file, "{not json");
    expect(await store.read()).toEqual({});
    writeFileSync(file, JSON.stringify({ libraryPath: 42 }));
    expect(await store.read()).toEqual({});
  });
});

describe("openLibrary", () => {
  it("creates the folder layout and library.db, then reopens cleanly", async () => {
    const root = path.join(makeTempDir(), "SandwichLibrary");
    const first = await open(root);
    expect(first.migration.applied).toEqual([1]);
    expect(existsSync(path.join(root, "library.db"))).toBe(true);
    for (const dir of LIBRARY_DIRS) {
      expect(existsSync(path.join(root, ...dir.split("/")))).toBe(true);
    }
    first.repos.products.create({ fullName: "P", slug: "p" });
    closeDatabase(first.db);

    const second = await open(root, { mustExist: true });
    expect(second.migration.applied).toEqual([]);
    expect(second.repos.products.list()).toHaveLength(1);
  });

  it("mustExist refuses a missing folder or database without creating anything", async () => {
    const root = path.join(makeTempDir(), "gone");
    await expect(openLibrary(root, { mustExist: true })).rejects.toBeInstanceOf(
      LibraryNotFoundError,
    );
    expect(existsSync(root)).toBe(false);
  });

  it("refuses a library from a newer app and leaves it untouched", async () => {
    const root = await makeLibraryOnDisk(
      path.join(makeTempDir(), "lib"),
      LATEST_SCHEMA_VERSION + 1,
    );
    await expect(openLibrary(root)).rejects.toThrow(/Update Sandwich/);
  });
});

describe("inspectFolder", () => {
  it("an empty folder (ignoring .DS_Store) is used directly", async () => {
    const dir = makeTempDir();
    writeFileSync(path.join(dir, ".DS_Store"), "");
    const result = await inspectFolder(dir, { allowSubfolder: true });
    expect(result).toMatchObject({
      path: dir,
      isEmpty: true,
      isExistingLibrary: false,
      schemaTooNew: false,
      createsSubfolder: false,
      chosenPath: null,
      syncProvider: null,
    });
  });

  it("a folder that does not exist yet is empty", async () => {
    const result = await inspectFolder(path.join(makeTempDir(), "new", "Lib"), {
      allowSubfolder: false,
    });
    expect(result.isEmpty).toBe(true);
  });

  it("a non-empty non-library folder proposes a SandwichLibrary subfolder", async () => {
    const dir = makeTempDir();
    writeFileSync(path.join(dir, "movie.mov"), "x");
    const result = await inspectFolder(dir, { allowSubfolder: true });
    expect(result).toMatchObject({
      path: path.join(dir, "SandwichLibrary"),
      createsSubfolder: true,
      chosenPath: dir,
      isEmpty: true,
    });
    const direct = await inspectFolder(dir, { allowSubfolder: false });
    expect(direct).toMatchObject({
      path: dir,
      createsSubfolder: false,
      isEmpty: false,
    });
  });

  it("an existing library is recognised and opened directly", async () => {
    const root = await makeLibraryOnDisk(path.join(makeTempDir(), "Lib"));
    const result = await inspectFolder(root, { allowSubfolder: true });
    expect(result).toMatchObject({
      path: root,
      isExistingLibrary: true,
      isEmpty: false,
      schemaTooNew: false,
      createsSubfolder: false,
    });
  });

  it("flags a newer schema without migrating or backing up", async () => {
    const root = await makeLibraryOnDisk(
      path.join(makeTempDir(), "Lib"),
      LATEST_SCHEMA_VERSION + 1,
    );
    const result = await inspectFolder(root, { allowSubfolder: true });
    expect(result.schemaTooNew).toBe(true);
    expect(result.isExistingLibrary).toBe(true);
    const files = readdirSync(root);
    expect(files.some((f) => f.includes(".bak-"))).toBe(false);
  });

  it("detects a sync provider through a symlink (realpath)", async () => {
    const base = makeTempDir();
    const synced = path.join(base, "Dropbox", "stuff");
    mkdirSync(synced, { recursive: true });
    const link = path.join(base, "innocent-name");
    symlinkSync(synced, link);
    const result = await inspectFolder(link, { allowSubfolder: false });
    expect(result.syncProvider).toBe("dropbox");
    expect(result.path).toBe(link); // shown as chosen, detected on the real path
  });
});

function makeManager(
  opts: { picks?: Array<string | null>; defaultPath?: string } = {},
) {
  const userData = makeTempDir();
  const settingsFile = path.join(userData, "settings.json");
  const picks = [...(opts.picks ?? [])];
  const manager = createLibraryManager({
    settings: createSettingsStore(settingsFile),
    defaultPath:
      opts.defaultPath ?? path.join(makeTempDir(), "SandwichLibrary"),
    pickFolder: async () => picks.shift() ?? null,
  });
  return { manager, settingsFile, userData };
}

describe("library manager", () => {
  it("starts unconfigured, then choose + activate persists and survives a restart", async () => {
    const defaultPath = path.join(makeTempDir(), "SandwichLibrary");
    const { manager, settingsFile, userData } = makeManager({ defaultPath });
    expect(await manager.getState()).toEqual({
      status: "unconfigured",
      defaultPath,
    });
    expect(manager.getRoot()).toBeNull();

    const candidate = await manager.choose("default");
    expect(candidate?.path).toBe(defaultPath);
    // choose() has no side effects.
    expect(existsSync(defaultPath)).toBe(false);
    expect(existsSync(settingsFile)).toBe(false);

    const state = await manager.activate();
    expect(state).toEqual({
      status: "ready",
      path: defaultPath,
      syncProvider: null,
    });
    expect(manager.getRoot()).toBe(defaultPath);
    expect(manager.getRepos()?.products.list()).toEqual([]);
    expect(JSON.parse(readFileSync(settingsFile, "utf8"))).toEqual({
      libraryPath: defaultPath,
    });
    manager.close();

    // "Second launch": a new manager on the same userData goes straight in.
    const second = createLibraryManager({
      settings: createSettingsStore(path.join(userData, "settings.json")),
      defaultPath,
      pickFolder: async () => null,
    });
    expect(await second.getState()).toMatchObject({
      status: "ready",
      path: defaultPath,
    });
    second.close();
  });

  it("activate without a prior choose throws", async () => {
    const { manager } = makeManager();
    await expect(manager.activate()).rejects.toThrow(/Choose a library folder/);
  });

  it("a cancelled dialog returns null and keeps state", async () => {
    const { manager } = makeManager({ picks: [null] });
    expect(await manager.choose("dialog")).toBeNull();
    expect((await manager.getState()).status).toBe("unconfigured");
  });

  it("a saved library that went missing is an error that keeps the setting", async () => {
    const { manager, settingsFile, userData } = makeManager();
    const gone = path.join(userData, "unplugged", "Lib");
    writeFileSync(settingsFile, JSON.stringify({ libraryPath: gone }));
    const state = await manager.getState();
    expect(state).toMatchObject({ status: "error", path: gone });
    expect((state as { message: string }).message).toMatch(/not found/);
    expect(existsSync(path.dirname(gone))).toBe(false); // nothing silently created
    expect(JSON.parse(readFileSync(settingsFile, "utf8"))).toEqual({
      libraryPath: gone,
    });
    expect(manager.getRoot()).toBeNull();
  });

  it("corrupt settings.json reads as unconfigured", async () => {
    const { manager, settingsFile } = makeManager();
    writeFileSync(settingsFile, "{oops");
    expect((await manager.getState()).status).toBe("unconfigured");
  });

  it("a newer-schema library cannot be activated and nothing changes", async () => {
    const future = await makeLibraryOnDisk(
      path.join(makeTempDir(), "Future"),
      LATEST_SCHEMA_VERSION + 1,
    );
    const { manager, settingsFile } = makeManager({ picks: [future] });
    const candidate = await manager.choose("dialog");
    expect(candidate?.schemaTooNew).toBe(true);
    await expect(manager.activate()).rejects.toThrow(/newer version/);
    expect(existsSync(settingsFile)).toBe(false);
    expect(manager.getRoot()).toBeNull();
  });

  it("choosing a non-empty folder creates SandwichLibrary inside, or uses it directly on request", async () => {
    const busy = makeTempDir();
    writeFileSync(path.join(busy, "other.txt"), "x");
    const a = makeManager({ picks: [busy] });
    await a.manager.choose("dialog");
    expect((await a.manager.activate()).status).toBe("ready");
    expect(a.manager.getRoot()).toBe(path.join(busy, "SandwichLibrary"));
    expect(existsSync(path.join(busy, "library.db"))).toBe(false);
    a.manager.close();

    const b = makeManager({ picks: [busy] });
    await b.manager.choose("dialog");
    await b.manager.activate({ useChosenFolder: true });
    expect(b.manager.getRoot()).toBe(busy);
    expect(existsSync(path.join(busy, "library.db"))).toBe(true);
    b.manager.close();
  });

  it("switching libraries re-roots the media server and closes the old database", async () => {
    const libA = path.join(makeTempDir(), "A");
    const libB = path.join(makeTempDir(), "B");
    const { manager } = makeManager({ picks: [libA, libB] });

    const server = await startMediaServer({ getRoot: () => manager.getRoot() });
    servers.push(server);
    const get = (rel: string) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const url = new URL(`${server.baseUrl}/${rel}`);
        http
          .get(
            { host: "127.0.0.1", port: server.port, path: url.pathname },
            (res) => {
              let body = "";
              res.on("data", (c: Buffer) => (body += c.toString()));
              res.on("end", () =>
                resolve({ status: res.statusCode ?? 0, body }),
              );
            },
          )
          .on("error", reject);
      });

    expect((await get("clips/same.mp4")).status).toBe(503); // no library yet

    await manager.choose("dialog");
    await manager.activate();
    const dbA = manager.getRepos();
    writeFileSync(path.join(libA, "clips", "same.mp4"), "from A");
    writeFileSync(path.join(libA, "clips", "only-in-a.mp4"), "a");
    expect(await get("clips/same.mp4")).toEqual({
      status: 200,
      body: "from A",
    });

    await manager.choose("dialog");
    await manager.activate();
    writeFileSync(path.join(libB, "clips", "same.mp4"), "from B");
    expect(await get("clips/same.mp4")).toEqual({
      status: 200,
      body: "from B",
    });
    expect((await get("clips/only-in-a.mp4")).status).toBe(404); // no stale data from A
    expect(manager.getRepos()).not.toBe(dbA);
    expect(() => dbA?.products.list()).toThrow(); // old connection is closed
    manager.close();
  });

  it("a failed switch keeps the current library active", async () => {
    const libA = path.join(makeTempDir(), "A");
    const blocked = path.join(makeTempDir(), "file-not-folder");
    writeFileSync(blocked, "x");
    const { manager } = makeManager({
      picks: [libA, path.join(blocked, "Lib")],
    });
    await manager.choose("dialog");
    await manager.activate();
    await manager.choose("dialog");
    await expect(manager.activate()).rejects.toThrow();
    expect(manager.getRoot()).toBe(libA);
    expect(await manager.getState()).toMatchObject({
      status: "ready",
      path: libA,
    });
    manager.close();
  });
});
