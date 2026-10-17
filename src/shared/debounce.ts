// Trailing debounce: `fn` runs once, `waitMs` after the last call. Pure (timers are
// injectable so tests use a fake clock).
export type Timers = {
  set: (callback: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const REAL_TIMERS: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type Debounced = {
  (): void;
  // Drops a pending run.
  cancel: () => void;
};

export function debounce(
  fn: () => void,
  waitMs: number,
  timers: Timers = REAL_TIMERS,
): Debounced {
  let handle: unknown = null;
  const run = (() => {
    if (handle !== null) {
      timers.clear(handle);
    }
    handle = timers.set(() => {
      handle = null;
      fn();
    }, waitMs);
  }) as Debounced;
  run.cancel = () => {
    if (handle !== null) {
      timers.clear(handle);
      handle = null;
    }
  };
  return run;
}
