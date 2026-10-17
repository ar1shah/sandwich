import { describe, expect, it } from "vitest";
import {
  fileBaseName,
  hasImportExtension,
  ImportUgcInputSchema,
} from "../src/shared/jobs";

describe("import input schema", () => {
  it("accepts absolute mp4, mov and m4v paths in any letter case", () => {
    const paths = [
      "/Users/a/IMG_1234.MOV",
      "/Users/a/clip.Mp4",
      "/x/y.m4v",
      "C:\\clips\\a.MP4",
      "C:/clips/b.mov",
      "\\\\nas\\share\\c.mov",
    ];
    expect(ImportUgcInputSchema.parse(paths)).toEqual(paths);
  });

  it("matches extensions case-insensitively", () => {
    expect(hasImportExtension("IMG_1234.MOV")).toBe(true);
    expect(hasImportExtension("a.Mp4")).toBe(true);
    expect(hasImportExtension("a.mkv")).toBe(false);
    expect(hasImportExtension("mov")).toBe(false);
  });

  it("rejects relative paths, other types, empty and oversized lists", () => {
    expect(() => ImportUgcInputSchema.parse(["clip.mp4"])).toThrow();
    expect(() => ImportUgcInputSchema.parse(["../clip.mp4"])).toThrow();
    expect(() => ImportUgcInputSchema.parse(["/a/clip.avi"])).toThrow();
    expect(() => ImportUgcInputSchema.parse(["/a/clip.mov.exe"])).toThrow();
    expect(() => ImportUgcInputSchema.parse([])).toThrow();
    expect(() => ImportUgcInputSchema.parse("/a/b.mp4")).toThrow();
    expect(() =>
      ImportUgcInputSchema.parse(Array.from({ length: 201 }, () => "/a/b.mp4")),
    ).toThrow();
  });

  it("takes the last segment of either path style", () => {
    expect(fileBaseName("/a/b/IMG_1.MOV")).toBe("IMG_1.MOV");
    expect(fileBaseName("C:\\a\\b.mp4")).toBe("b.mp4");
    expect(fileBaseName("plain.mp4")).toBe("plain.mp4");
  });
});
