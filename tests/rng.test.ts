import { describe, expect, it } from "vitest";
import { createRng, hashSeed, shuffle } from "../src/shared/rng";

describe("createRng", () => {
  it("is deterministic for a seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(
      Array.from({ length: 5 }, () => b.next()),
    );
  });

  it("differs between seeds", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("accepts string seeds", () => {
    expect(hashSeed("batch-1")).toBe(hashSeed("batch-1"));
    expect(hashSeed("batch-1")).not.toBe(hashSeed("batch-2"));
    expect(createRng("batch-1").next()).toBe(createRng("batch-1").next());
  });

  it("stays in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("nextInt stays in range and covers it", () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.nextInt(4);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it("nextInt rejects bad bounds", () => {
    const rng = createRng(1);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(-1)).toThrow(RangeError);
    expect(() => rng.nextInt(1.5)).toThrow(RangeError);
  });
});

describe("shuffle", () => {
  it("returns a permutation and leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, createRng(5));
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
  });

  it("is deterministic for a seed", () => {
    const items = ["a", "b", "c", "d", "e"];
    expect(shuffle(items, createRng(3))).toEqual(shuffle(items, createRng(3)));
  });

  it("handles empty and single-item arrays", () => {
    expect(shuffle([], createRng(1))).toEqual([]);
    expect(shuffle(["x"], createRng(1))).toEqual(["x"]);
  });
});
