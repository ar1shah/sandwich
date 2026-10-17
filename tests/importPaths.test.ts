import { describe, expect, it } from "vitest";
import { assertRelativeLibraryPath } from "../src/shared/libraryPaths";
import {
  brollPaths,
  importMonthFolder,
  jobTmpDir,
  ugcClipPaths,
} from "../src/shared/importPaths";

describe("import paths", () => {
  it("uses the LOCAL import date from the injected clock for yyyy-mm", () => {
    // Built from local parts, so this holds in any time zone. 23:30 on the 31st is still
    // October locally even though it may already be November in UTC.
    expect(importMonthFolder(new Date(2026, 9, 31, 23, 30))).toBe("2026-10");
    expect(importMonthFolder(new Date(2026, 0, 1, 0, 5))).toBe("2026-01");
    expect(importMonthFolder(new Date(2027, 11, 15))).toBe("2027-12");
  });

  it("builds ugc paths: clip and thumb side by side, filmstrip in the cache", () => {
    expect(ugcClipPaths("abc", new Date(2026, 9, 17))).toEqual({
      video: "clips/2026-10/abc.mp4",
      thumb: "clips/2026-10/abc.jpg",
      filmstrip: "cache/filmstrips/abc.jpg",
    });
  });

  it("builds broll paths under the product", () => {
    expect(brollPaths("p1", "b1")).toEqual({
      video: "products/p1/broll/b1.mp4",
      thumb: "products/p1/broll/b1.jpg",
      filmstrip: "cache/filmstrips/b1.jpg",
    });
  });

  it("every path is a valid library-relative path", () => {
    const all = [
      ...Object.values(ugcClipPaths("id", new Date(2026, 9, 17))),
      ...Object.values(brollPaths("p", "b")),
      jobTmpDir("job-1"),
    ];
    for (const rel of all) {
      expect(assertRelativeLibraryPath(rel)).toBe(rel);
    }
  });

  it("stages a job under cache/tmp", () => {
    expect(jobTmpDir("j")).toBe("cache/tmp/j");
  });
});
