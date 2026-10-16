// Small seeded PRNG so batch auto-fill is reproducible ("Re-roll" = a new seed on purpose).
// mulberry32 is not cryptographic; it only needs to be fast, small and deterministic.

export type Rng = {
  // Float in [0, 1)
  next(): number;
  // Integer in [0, max)
  nextInt(max: number): number;
};

// FNV-1a 32-bit, so string seeds (a batch id, say) work too.
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createRng(seed: number | string): Rng {
  let state = (typeof seed === "string" ? hashSeed(seed) : seed) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt(max: number): number {
      if (!Number.isInteger(max) || max <= 0) {
        throw new RangeError(
          `nextInt max must be a positive integer, got ${max}`,
        );
      }
      return Math.floor(next() * max);
    },
  };
}

// Fisher-Yates on a copy.
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
