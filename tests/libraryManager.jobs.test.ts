import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { closeDatabase } from "../src/main/db/connection";
import { createLibraryManager } from "../src/main/library/libraryManager";
import { openLibrary } from "../src/main/library/openLibrary";
import { createSettingsStore } from "../src/main/library/settings";
import { makeTempDir } from "./helpers/db";

function makeManager(
  hooks: {
    beforeClosePrevious?: () => Promise<void>;
    sweep?: (root: string) => Promise<void>;
  },
  picks: string[],
) {
  const userData = makeTempDir();
  return createLibraryManager({
    settings: createSettingsStore(path.join(userData, "settings.json")),
    defaultPath: path.join(makeTempDir(), "SandwichLibrary"),
    pickFolder: async () => picks.shift() ?? null,
    ...hooks,
  });
}

async function makeLibrary(extraVersion?: number): Promise<string> {
  const root = path.join(makeTempDir(), "Lib");
  const lib = await openLibrary(root);
  if (extraVersion !== undefined) {
    lib.db
      .prepare("INSERT INTO schema_migrations VALUES (?, 'future', 't')")
      .run(extraVersion);
  }
  closeDatabase(lib.db);
  return root;
}

describe("library manager: switching with jobs", () => {
  it("cancels jobs after the new library opened, before the old one closes", async () => {
    const [first, second] = [await makeLibrary(), await makeLibrary()];
    const calls: string[] = [];
    const manager = makeManager(
      {
        beforeClosePrevious: async () => {
          // The old database must still be usable while jobs wind down.
          calls.push(
            `cancel (root still ${manager.getRoot() === first ? "old" : "new"})`,
          );
          expect(manager.getRepos()?.products.list()).toEqual([]);
        },
        sweep: async (root) => {
          calls.push(`sweep ${root === second ? "second" : "first"}`);
        },
      },
      [first, second],
    );

    await manager.choose("dialog");
    await manager.activate();
    // First library: there is no previous one, so nothing is cancelled; only the sweep ran.
    expect(calls).toEqual(["sweep first"]);
    calls.length = 0;

    await manager.choose("dialog");
    await manager.activate();

    expect(calls).toEqual(["cancel (root still old)", "sweep second"]);
    expect(manager.getRoot()).toBe(second);
    manager.close();
  });

  it("a failed switch cancels nothing and keeps the current library", async () => {
    const good = await makeLibrary();
    const tooNew = await makeLibrary(9999);
    let cancelled = 0;
    const manager = makeManager(
      {
        beforeClosePrevious: async () => {
          cancelled++;
        },
        sweep: async () => undefined,
      },
      [good, tooNew],
    );
    await manager.choose("dialog");
    await manager.activate();
    const before = cancelled;

    await manager.choose("dialog");
    await expect(manager.activate()).rejects.toThrow(/newer version/);
    expect(cancelled).toBe(before);
    expect(manager.getRoot()).toBe(good);
    manager.close();
  });

  it("sweeps a saved library when the app starts, and a sweep error does not block opening", async () => {
    const root = await makeLibrary();
    mkdirSync(path.join(root, "cache", "tmp", "dead-job"), { recursive: true });
    writeFileSync(path.join(root, "cache", "tmp", "dead-job", "clip.mp4"), "x");

    const userData = makeTempDir();
    const settingsFile = path.join(userData, "settings.json");
    writeFileSync(settingsFile, JSON.stringify({ libraryPath: root }));

    const swept = createLibraryManager({
      settings: createSettingsStore(settingsFile),
      defaultPath: root,
      pickFolder: async () => null,
    });
    expect((await swept.getState()).status).toBe("ready");
    expect(existsSync(path.join(root, "cache", "tmp", "dead-job"))).toBe(false);
    swept.close();

    const failing = createLibraryManager({
      settings: createSettingsStore(settingsFile),
      defaultPath: root,
      pickFolder: async () => null,
      sweep: async () => {
        throw new Error("disk says no");
      },
    });
    expect((await failing.getState()).status).toBe("ready");
    failing.close();
  });
});
