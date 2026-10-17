import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMediaLookup } from "../src/main/media/mediaLookup";
import { isUsableMedia } from "../src/shared/mediaLookup";
import { makeTempLibraryDb } from "./helpers/db";

async function setup() {
  const lib = await makeTempLibraryDb();
  const lookup = createMediaLookup({
    getLibrary: () => ({ root: lib.root, repos: lib.repos }),
  });
  const add = (relative: string, writeFileToDisk: boolean) => {
    const row = lib.repos.media.create({
      kind: "ugc",
      path: relative,
      duration: 4,
      width: 1080,
      height: 1920,
    });
    return writeFileToDisk
      ? mkdir(path.dirname(path.join(lib.root, relative)), { recursive: true })
          .then(() => writeFile(path.join(lib.root, relative), "x"))
          .then(() => row)
      : Promise.resolve(row);
  };
  return { ...lib, lookup, add };
}

describe("mediaLookup", () => {
  it("gets a row by id", async () => {
    const { lookup, add } = await setup();
    const row = await add("clips/2026-10/a.mp4", true);
    expect(lookup.get(row.id)?.path).toBe("clips/2026-10/a.mp4");
    expect(lookup.get("nope")).toBeNull();
  });

  it("reports row and file separately, in input order", async () => {
    const { lookup, add } = await setup();
    await add("clips/2026-10/ok.mp4", true);
    await add("clips/2026-10/nofile.mp4", false);
    const checks = await lookup.byPaths([
      "clips/2026-10/ok.mp4",
      "clips/2026-10/nofile.mp4",
      "clips/2026-10/norow.mp4",
    ]);
    expect(checks.map((c) => [c.path, c.media !== null, c.fileExists])).toEqual(
      [
        ["clips/2026-10/ok.mp4", true, true],
        ["clips/2026-10/nofile.mp4", true, false],
        ["clips/2026-10/norow.mp4", false, false],
      ],
    );
    expect(checks.map(isUsableMedia)).toEqual([true, false, false]);
  });

  it("treats a file with a row that was deleted by hand as missing", async () => {
    const { lookup, add, root } = await setup();
    await add("clips/2026-10/gone.mp4", true);
    const { rm } = await import("node:fs/promises");
    await rm(path.join(root, "clips/2026-10/gone.mp4"));
    const [check] = await lookup.byPaths(["clips/2026-10/gone.mp4"]);
    expect(isUsableMedia(check)).toBe(false);
  });

  it("never stats an unsafe path", async () => {
    const { lookup } = await setup();
    const checks = await lookup.byPaths([
      "../outside.mp4",
      "/etc/hosts",
      "a\\b",
    ]);
    expect(checks.every((c) => !c.media && !c.fileExists)).toBe(true);
  });
});
