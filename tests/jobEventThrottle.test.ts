import { describe, expect, it } from "vitest";
import { createJobEventThrottle } from "../src/shared/jobEventThrottle";
import type { JobEvent, JobEventType } from "../src/shared/jobs";

function setup() {
  let clock = 1000;
  const timers: Array<{ at: number; fn: () => void; cancelled: boolean }> = [];
  const sent: JobEvent[] = [];
  const throttle = createJobEventThrottle({
    send: (event) => sent.push(event),
    intervalMs: 100,
    now: () => clock,
    setTimer: (fn, ms) => {
      const timer = { at: clock + ms, fn, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cancelled: boolean }).cancelled = true;
    },
  });
  const advance = (ms: number) => {
    clock += ms;
    for (const timer of timers) {
      if (!timer.cancelled && timer.at <= clock) {
        timer.cancelled = true;
        timer.fn();
      }
    }
  };
  return { throttle, sent, advance };
}

const event = (type: JobEventType, percent = 0, id = "j1"): JobEvent => ({
  type,
  job: {
    id,
    type: "importClip",
    label: id,
    state: "running",
    percent,
    seq: 0,
    order: 1,
    updatedAt: "t",
  },
});

describe("job event throttle", () => {
  it("sends the first progress at once, holds the rest, delivers only the newest", () => {
    const { throttle, sent, advance } = setup();
    throttle.push(event("progress", 1));
    throttle.push(event("progress", 2));
    throttle.push(event("progress", 3));
    expect(sent.map((e) => e.job.percent)).toEqual([1]);
    advance(100);
    expect(sent.map((e) => e.job.percent)).toEqual([1, 3]);
  });

  it("sends progress straight away once the interval has passed", () => {
    const { throttle, sent, advance } = setup();
    throttle.push(event("progress", 1));
    advance(150);
    throttle.push(event("progress", 2));
    expect(sent.map((e) => e.job.percent)).toEqual([1, 2]);
  });

  it("never drops or delays a state change", () => {
    const { throttle, sent } = setup();
    for (const type of ["queued", "started", "done"] as const) {
      throttle.push(event(type));
    }
    expect(sent.map((e) => e.type)).toEqual(["queued", "started", "done"]);
  });

  it("a terminal event discards the pending progress, which never arrives after it", () => {
    const { throttle, sent, advance } = setup();
    throttle.push(event("progress", 10));
    throttle.push(event("progress", 90)); // pending
    throttle.push(event("done"));
    advance(500);
    expect(sent.map((e) => `${e.type}:${e.job.percent}`)).toEqual([
      "progress:10",
      "done:0",
    ]);
  });

  it("throttles each job on its own", () => {
    const { throttle, sent } = setup();
    throttle.push(event("progress", 1, "a"));
    throttle.push(event("progress", 1, "b"));
    expect(sent).toHaveLength(2);
  });

  it("dispose drops pending progress", () => {
    const { throttle, sent, advance } = setup();
    throttle.push(event("progress", 1));
    throttle.push(event("progress", 2));
    throttle.dispose();
    advance(500);
    expect(sent).toHaveLength(1);
  });
});
