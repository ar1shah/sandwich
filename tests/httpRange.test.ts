import { describe, expect, it } from "vitest";
import { parseRangeHeader } from "../src/shared/httpRange";

describe("parseRangeHeader", () => {
  it("serves the whole file when there is no header", () => {
    expect(parseRangeHeader(undefined, 1000)).toEqual({ kind: "none" });
    expect(parseRangeHeader("", 1000)).toEqual({ kind: "none" });
  });

  it("parses a closed range", () => {
    expect(parseRangeHeader("bytes=0-499", 1000)).toEqual({
      kind: "range",
      start: 0,
      end: 499,
    });
  });

  it("parses an open-ended range", () => {
    expect(parseRangeHeader("bytes=500-", 1000)).toEqual({
      kind: "range",
      start: 500,
      end: 999,
    });
  });

  it("parses a suffix range", () => {
    expect(parseRangeHeader("bytes=-200", 1000)).toEqual({
      kind: "range",
      start: 800,
      end: 999,
    });
    expect(parseRangeHeader("bytes=-5000", 1000)).toEqual({
      kind: "range",
      start: 0,
      end: 999,
    });
  });

  it("clamps an end past the file", () => {
    expect(parseRangeHeader("bytes=900-5000", 1000)).toEqual({
      kind: "range",
      start: 900,
      end: 999,
    });
  });

  it("reports unsatisfiable ranges", () => {
    expect(parseRangeHeader("bytes=1000-", 1000)).toEqual({
      kind: "unsatisfiable",
    });
    expect(parseRangeHeader("bytes=-0", 1000)).toEqual({
      kind: "unsatisfiable",
    });
    expect(parseRangeHeader("bytes=0-10", 0)).toEqual({
      kind: "unsatisfiable",
    });
  });

  it("ignores malformed, multi-range and reversed headers", () => {
    expect(parseRangeHeader("bytes=abc", 1000)).toEqual({ kind: "none" });
    expect(parseRangeHeader("items=0-5", 1000)).toEqual({ kind: "none" });
    expect(parseRangeHeader("bytes=0-5,10-20", 1000)).toEqual({ kind: "none" });
    expect(parseRangeHeader("bytes=-", 1000)).toEqual({ kind: "none" });
    expect(parseRangeHeader("bytes=500-100", 1000)).toEqual({ kind: "none" });
  });
});
