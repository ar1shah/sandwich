import { describe, expect, it } from "vitest";
import { nextGridIndex } from "../src/shared/gridNav";

// 7 items in 3 columns:
//   0 1 2
//   3 4 5
//   6
describe("nextGridIndex", () => {
  it("goes to the first item when nothing is focused", () => {
    expect(nextGridIndex(-1, "ArrowDown", 7, 3)).toBe(0);
    expect(nextGridIndex(-1, "ArrowLeft", 7, 3)).toBe(0);
  });

  it("moves left and right by one and stops at the ends", () => {
    expect(nextGridIndex(4, "ArrowRight", 7, 3)).toBe(5);
    expect(nextGridIndex(4, "ArrowLeft", 7, 3)).toBe(3);
    expect(nextGridIndex(0, "ArrowLeft", 7, 3)).toBe(0);
    expect(nextGridIndex(6, "ArrowRight", 7, 3)).toBe(6);
  });

  it("moves up and down by a row", () => {
    expect(nextGridIndex(1, "ArrowDown", 7, 3)).toBe(4);
    expect(nextGridIndex(4, "ArrowUp", 7, 3)).toBe(1);
    expect(nextGridIndex(1, "ArrowUp", 7, 3)).toBe(1);
  });

  it("lands on the last item when the row below is short", () => {
    expect(nextGridIndex(5, "ArrowDown", 7, 3)).toBe(6);
    expect(nextGridIndex(4, "ArrowDown", 7, 3)).toBe(6);
  });

  it("stays put on the last row", () => {
    expect(nextGridIndex(6, "ArrowDown", 7, 3)).toBe(6);
    expect(nextGridIndex(2, "ArrowDown", 3, 3)).toBe(2);
  });

  it("works with one column and with more columns than items", () => {
    expect(nextGridIndex(0, "ArrowDown", 3, 1)).toBe(1);
    expect(nextGridIndex(2, "ArrowUp", 3, 1)).toBe(1);
    expect(nextGridIndex(0, "ArrowDown", 2, 5)).toBe(0);
  });

  it("returns -1 for an empty grid and recovers from a stale index", () => {
    expect(nextGridIndex(0, "ArrowDown", 0, 3)).toBe(-1);
    expect(nextGridIndex(9, "ArrowLeft", 4, 3)).toBe(0);
  });

  it("treats a bad column count as one column", () => {
    expect(nextGridIndex(0, "ArrowDown", 3, 0)).toBe(1);
  });
});
