import { describe, expect, it } from "vitest";
import { createRng } from "../src/shared/rng";
import { createShuffleBag } from "../src/shared/shuffleBag";

const draw = <T>(bag: { next(): T }, n: number): T[] =>
  Array.from({ length: n }, () => bag.next());

describe("createShuffleBag", () => {
  it("uses every item before repeating any", () => {
    const items = ["a", "b", "c", "d", "e"];
    const bag = createShuffleBag(items, createRng(11));
    for (let round = 0; round < 4; round++) {
      expect(draw(bag, 5).sort()).toEqual(items);
    }
  });

  it("never repeats back-to-back, including across rounds", () => {
    for (let seed = 0; seed < 200; seed++) {
      const bag = createShuffleBag([1, 2, 3], createRng(seed));
      const seq = draw(bag, 60);
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i]).not.toBe(seq[i - 1]);
      }
    }
  });

  it("no back-to-back with just two items", () => {
    for (let seed = 0; seed < 50; seed++) {
      const seq = draw(createShuffleBag(["x", "y"], createRng(seed)), 20);
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i]).not.toBe(seq[i - 1]);
      }
    }
  });

  it("is deterministic for a seed and differs across seeds", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = draw(createShuffleBag(items, createRng(4)), 24);
    const b = draw(createShuffleBag(items, createRng(4)), 24);
    const c = draw(createShuffleBag(items, createRng(5)), 24);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("a single item can only repeat itself", () => {
    expect(draw(createShuffleBag(["only"], createRng(1)), 3)).toEqual([
      "only",
      "only",
      "only",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [1, 2, 3];
    draw(createShuffleBag(items, createRng(1)), 9);
    expect(items).toEqual([1, 2, 3]);
  });

  it("rejects an empty list", () => {
    expect(() => createShuffleBag([], createRng(1))).toThrow();
  });
});
