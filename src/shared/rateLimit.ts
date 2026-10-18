// Lets at most `max` events through in any `windowMs`. Pure: the clock is passed in.
export function createRateLimiter(
  max: number,
  windowMs: number,
  now: () => number = Date.now,
) {
  let stamps: number[] = [];
  return {
    // true = allowed (and counted), false = over the limit.
    take(): boolean {
      const t = now();
      stamps = stamps.filter((stamp) => t - stamp < windowMs);
      if (stamps.length >= max) {
        return false;
      }
      stamps.push(t);
      return true;
    },
  };
}
