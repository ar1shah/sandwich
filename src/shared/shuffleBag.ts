import { shuffle, type Rng } from "./rng";

// Shuffle bag: every item is drawn once before any item repeats, and the first draw of a new
// round never equals the last draw of the previous round (no back-to-back repeats).
// With a single item it can only repeat that item.

export type ShuffleBag<T> = { next(): T };

export function createShuffleBag<T>(
  items: readonly T[],
  rng: Rng,
): ShuffleBag<T> {
  if (items.length === 0) {
    throw new Error("createShuffleBag needs at least one item");
  }
  let bag: T[] = [];
  let last: { value: T } | null = null;

  const refill = (): void => {
    bag = shuffle(items, rng);
    // Draws pop from the end, so the first draw is the last element.
    const lastIndex = bag.length - 1;
    if (last !== null && bag.length > 1 && bag[lastIndex] === last.value) {
      const swapWith = rng.nextInt(lastIndex);
      [bag[lastIndex], bag[swapWith]] = [bag[swapWith]!, bag[lastIndex]!];
    }
  };

  return {
    next(): T {
      if (bag.length === 0) {
        refill();
      }
      const value = bag.pop() as T;
      last = { value };
      return value;
    },
  };
}
