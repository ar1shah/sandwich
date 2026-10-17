import { describe, expect, it } from "vitest";
import { debounce, type Timers } from "../src/shared/debounce";

// A manual clock: advance() fires whatever is due.
function fakeTimers() {
  let now = 0;
  let nextHandle = 1;
  const pending = new Map<number, { at: number; callback: () => void }>();
  const timers: Timers = {
    set: (callback, ms) => {
      const handle = nextHandle++;
      pending.set(handle, { at: now + ms, callback });
      return handle;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
  };
  return {
    timers,
    advance(ms: number) {
      now += ms;
      for (const [handle, timer] of [...pending]) {
        if (timer.at <= now) {
          pending.delete(handle);
          timer.callback();
        }
      }
    },
  };
}

describe("debounce", () => {
  it("runs once, after the last call", () => {
    const clock = fakeTimers();
    let runs = 0;
    const run = debounce(() => runs++, 300, clock.timers);
    for (let i = 0; i < 10; i++) {
      run();
      clock.advance(100);
    }
    expect(runs).toBe(0);
    clock.advance(300);
    expect(runs).toBe(1);
    clock.advance(1000);
    expect(runs).toBe(1);
  });

  it("runs again for a later burst", () => {
    const clock = fakeTimers();
    let runs = 0;
    const run = debounce(() => runs++, 300, clock.timers);
    run();
    clock.advance(300);
    run();
    run();
    clock.advance(300);
    expect(runs).toBe(2);
  });

  it("cancel drops the pending run", () => {
    const clock = fakeTimers();
    let runs = 0;
    const run = debounce(() => runs++, 300, clock.timers);
    run();
    run.cancel();
    clock.advance(1000);
    expect(runs).toBe(0);
  });
});
