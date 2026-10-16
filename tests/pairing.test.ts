import { describe, expect, it } from "vitest";
import {
  pairByDate,
  pairInOrder,
  pairTwoColumns,
  recordedTime,
} from "../src/shared/pairing";

type F = { name: string; recordedAt: string | null; mtimeMs: number };
const f = (name: string, recordedAt: string | null, mtimeMs = 0): F => ({
  name,
  recordedAt,
  mtimeMs,
});
const names = (rows: { before: F; after: F }[]): string[][] =>
  rows.map((r) => [r.before.name, r.after.name]);

describe("pairInOrder", () => {
  it("pairs consecutive files", () => {
    const result = pairInOrder(["b1", "a1", "b2", "a2"]);
    expect(result.rows).toEqual([
      { before: "b1", after: "a1" },
      { before: "b2", after: "a2" },
    ]);
    expect(result.leftovers).toEqual([]);
  });

  it("leaves the last file over when the count is odd", () => {
    const result = pairInOrder(["b1", "a1", "b2"]);
    expect(result.rows).toHaveLength(1);
    expect(result.leftovers).toEqual(["b2"]);
  });

  it("handles empty and single-file input", () => {
    expect(pairInOrder([])).toEqual({ rows: [], leftovers: [] });
    expect(pairInOrder(["only"])).toEqual({ rows: [], leftovers: ["only"] });
  });
});

describe("recordedTime", () => {
  it("prefers recordedAt, falling back to mtime when missing or invalid", () => {
    expect(recordedTime(f("x", "2026-10-15T10:00:00Z", 5))).toBe(
      Date.parse("2026-10-15T10:00:00Z"),
    );
    expect(recordedTime(f("x", null, 5))).toBe(5);
    expect(recordedTime(f("x", "not a date", 7))).toBe(7);
  });
});

describe("pairByDate", () => {
  it("sorts by recording time before pairing, whatever the input order", () => {
    const result = pairByDate([
      f("after2", "2026-10-15T10:03:00Z"),
      f("before1", "2026-10-15T10:00:00Z"),
      f("after1", "2026-10-15T10:01:00Z"),
      f("before2", "2026-10-15T10:02:00Z"),
    ]);
    expect(names(result.rows)).toEqual([
      ["before1", "after1"],
      ["before2", "after2"],
    ]);
  });

  it("uses mtime for files without a recording date", () => {
    const result = pairByDate([
      f("later", null, 2000),
      f("earlier", null, 1000),
    ]);
    expect(names(result.rows)).toEqual([["earlier", "later"]]);
  });

  it("mixes recorded dates and mtimes on one timeline", () => {
    const t = Date.parse("2026-10-15T10:00:00Z");
    const result = pairByDate([
      f("b", null, t + 1000),
      f("a", "2026-10-15T10:00:00Z", 999_999_999_999_999),
    ]);
    expect(names(result.rows)).toEqual([["a", "b"]]);
  });

  it("is stable on ties (input order wins)", () => {
    const result = pairByDate([
      f("one", "2026-10-15T10:00:00Z"),
      f("two", "2026-10-15T10:00:00Z"),
      f("three", "2026-10-15T10:00:00Z"),
      f("four", "2026-10-15T10:00:00Z"),
    ]);
    expect(names(result.rows)).toEqual([
      ["one", "two"],
      ["three", "four"],
    ]);
  });

  it("returns the newest file as leftover for an odd count and does not mutate input", () => {
    const input = [
      f("c", "2026-10-15T10:02:00Z"),
      f("a", "2026-10-15T10:00:00Z"),
      f("b", "2026-10-15T10:01:00Z"),
    ];
    const copy = input.slice();
    const result = pairByDate(input);
    expect(names(result.rows)).toEqual([["a", "b"]]);
    expect(result.leftovers.map((x) => x.name)).toEqual(["c"]);
    expect(input).toEqual(copy);
  });
});

describe("pairTwoColumns", () => {
  it("pairs top to bottom", () => {
    expect(pairTwoColumns(["b1", "b2"], ["a1", "a2"])).toEqual({
      rows: [
        { before: "b1", after: "a1" },
        { before: "b2", after: "a2" },
      ],
      leftovers: [],
    });
  });

  it("leaves extra befores over", () => {
    const result = pairTwoColumns(["b1", "b2", "b3"], ["a1"]);
    expect(result.rows).toHaveLength(1);
    expect(result.leftovers).toEqual(["b2", "b3"]);
  });

  it("leaves extra afters over", () => {
    const result = pairTwoColumns(["b1"], ["a1", "a2"]);
    expect(result.rows).toHaveLength(1);
    expect(result.leftovers).toEqual(["a2"]);
  });

  it("handles an empty column", () => {
    expect(pairTwoColumns([], ["a1"])).toEqual({ rows: [], leftovers: ["a1"] });
    expect(pairTwoColumns([], [])).toEqual({ rows: [], leftovers: [] });
  });
});
