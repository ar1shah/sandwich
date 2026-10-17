import { describe, expect, it } from "vitest";
import {
  createJobScheduler,
  type JobRunContext,
} from "../src/shared/jobScheduler";
import {
  isTerminalJobState,
  type JobEvent,
  type JobInfo,
} from "../src/shared/jobs";

// A runner the test finishes by hand.
function controllable() {
  const control = {
    started: 0,
    context: null as JobRunContext | null,
    resolve: (() => undefined) as (result?: { mediaId: string }) => void,
    reject: (() => undefined) as (error: unknown) => void,
  };
  const run = (context: JobRunContext) =>
    new Promise<{ mediaId: string } | void>((resolve, reject) => {
      control.started++;
      control.context = context;
      control.resolve = resolve;
      control.reject = reject;
    });
  return { control, run };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(extra: Parameters<typeof createJobScheduler>[0] = {}) {
  const events: JobEvent[] = [];
  const scheduler = createJobScheduler({
    onEvent: (event) => events.push(event),
    now: () => "2026-10-17T00:00:00.000Z",
    ...extra,
  });
  const stateOf = (id: string): JobInfo | undefined =>
    scheduler.snapshot().find((job) => job.id === id);
  return { scheduler, events, stateOf };
}

function jobs(count: number) {
  return Array.from({ length: count }, () => controllable());
}

describe("job scheduler: queueing and concurrency", () => {
  it("runs 2 importClip jobs at a time, FIFO, and pumps the queue", async () => {
    const { scheduler, stateOf } = setup();
    const all = jobs(5);
    const ids = all.map(({ run }, i) =>
      scheduler.enqueue({ type: "importClip", label: `clip ${i}`, run }),
    );
    expect(all.map((j) => j.control.started)).toEqual([1, 1, 0, 0, 0]);
    expect(ids.map((id) => stateOf(id)?.state)).toEqual([
      "running",
      "running",
      "queued",
      "queued",
      "queued",
    ]);

    all[0]?.control.resolve();
    await flush();
    expect(all.map((j) => j.control.started)).toEqual([1, 1, 1, 0, 0]);

    all[2]?.control.resolve();
    all[1]?.control.resolve();
    await flush();
    expect(all.map((j) => j.control.started)).toEqual([1, 1, 1, 1, 1]);
  });

  it("never exceeds the limit while jobs finish and start", async () => {
    const { scheduler } = setup();
    let current = 0;
    let peak = 0;
    const run = async () => {
      current++;
      peak = Math.max(peak, current);
      await flush();
      current--;
    };
    for (let i = 0; i < 8; i++) {
      scheduler.enqueue({ type: "importClip", label: String(i), run });
    }
    while (scheduler.hasActive()) {
      await flush();
    }
    expect(peak).toBe(2);
  });

  it("render has its own pool of 1, independent of the import pool", () => {
    const { scheduler } = setup();
    const imports = jobs(3);
    const renders = jobs(2);
    for (const { run } of imports) {
      scheduler.enqueue({ type: "importClip", label: "i", run });
    }
    for (const { run } of renders) {
      scheduler.enqueue({ type: "render", label: "r", run });
    }
    expect(imports.map((j) => j.control.started)).toEqual([1, 1, 0]);
    expect(renders.map((j) => j.control.started)).toEqual([1, 0]);
  });

  it("rejects a type that has no runner yet", () => {
    const { scheduler } = setup({ enabledTypes: ["importClip"] });
    expect(() =>
      scheduler.enqueue({ type: "render", label: "r", run: () => undefined }),
    ).toThrow(/not available yet/);
    expect(scheduler.hasActive()).toBe(false);
  });

  it("handles a runner that throws synchronously", async () => {
    const { scheduler, events } = setup();
    scheduler.enqueue({
      type: "importClip",
      label: "boom",
      run: () => {
        throw new Error("sync boom");
      },
    });
    await flush();
    expect(events.map((e) => e.type)).toEqual(["queued", "started", "failed"]);
    expect(events.at(-1)?.job.error).toBe("sync boom");
    expect(scheduler.hasActive()).toBe(false);
  });
});

describe("job scheduler: results and failures", () => {
  it("done carries the result and 100 percent", async () => {
    const { scheduler, events } = setup();
    const { control, run } = controllable();
    const id = scheduler.enqueue({ type: "importClip", label: "a", run });
    control.resolve({ mediaId: "m1" });
    await flush();
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    expect(done?.job).toMatchObject({
      id,
      state: "done",
      percent: 100,
      result: { mediaId: "m1" },
    });
  });

  it("a runner error is failed with its message, and the next job still starts", async () => {
    const { scheduler, events } = setup({
      limits: { importClip: 1, render: 1 },
    });
    const [first, second] = jobs(2);
    scheduler.enqueue({ type: "importClip", label: "a", run: first!.run });
    scheduler.enqueue({ type: "importClip", label: "b", run: second!.run });
    first!.control.reject(new Error("ffmpeg exploded"));
    await flush();
    const failed = events.find((e) => e.type === "failed");
    expect(failed?.job).toMatchObject({
      state: "failed",
      error: "ffmpeg exploded",
    });
    expect(second!.control.started).toBe(1);
  });

  it("keeps the last N finished jobs in the snapshot", async () => {
    const { scheduler } = setup({ historyLimit: 3 });
    for (let i = 0; i < 5; i++) {
      scheduler.enqueue({
        type: "importClip",
        label: `j${i}`,
        run: () => ({ mediaId: `m${i}` }),
      });
    }
    while (scheduler.hasActive()) {
      await flush();
    }
    expect(scheduler.snapshot().map((j) => j.label)).toEqual([
      "j2",
      "j3",
      "j4",
    ]);
  });
});

describe("job scheduler: progress", () => {
  it("clamps, never goes down, and only emits on change", () => {
    const { scheduler, events } = setup();
    const { control, run } = controllable();
    scheduler.enqueue({ type: "importClip", label: "a", run });
    const ctx = control.context!;
    ctx.setProgress(30, "Converting");
    ctx.setProgress(20, "Converting"); // lower: ignored
    ctx.setProgress(30, "Converting"); // same: no event
    ctx.setProgress(250, "Filmstrip"); // clamped
    ctx.setProgress(Number.NaN, "Filmstrip"); // ignored
    const progress = events
      .filter((e) => e.type === "progress")
      .map((e) => [e.job.percent, e.job.stage]);
    expect(progress).toEqual([
      [30, "Converting"],
      [100, "Filmstrip"],
    ]);
  });

  it("seq grows with every event and stamps the job", () => {
    const { scheduler, events } = setup();
    const { control, run } = controllable();
    scheduler.enqueue({ type: "importClip", label: "a", run });
    control.context!.setProgress(10);
    control.context!.setProgress(20);
    const seqs = events.map((e) => e.job.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it("order is fixed at enqueue time", () => {
    const { scheduler, events } = setup();
    const [a, b] = jobs(2);
    scheduler.enqueue({ type: "importClip", label: "a", run: a!.run });
    scheduler.enqueue({ type: "importClip", label: "b", run: b!.run });
    a!.control.context!.setProgress(50);
    const byLabel = (label: string) =>
      events.filter((e) => e.job.label === label).map((e) => e.job.order);
    expect(new Set(byLabel("a")).size).toBe(1);
    expect(byLabel("a")[0]).toBeLessThan(byLabel("b")[0]!);
  });

  it("ignores progress after cancel was requested", () => {
    const { scheduler, events } = setup();
    const { control, run } = controllable();
    const id = scheduler.enqueue({ type: "importClip", label: "a", run });
    scheduler.cancel(id);
    const before = events.length;
    control.context!.setProgress(80);
    expect(events.length).toBe(before);
  });
});

describe("job scheduler: cancel", () => {
  it("cancelling a queued job drops it at once and it never runs", () => {
    const { scheduler, events, stateOf } = setup({
      limits: { importClip: 1, render: 1 },
    });
    const [a, b] = jobs(2);
    scheduler.enqueue({ type: "importClip", label: "a", run: a!.run });
    const queuedId = scheduler.enqueue({
      type: "importClip",
      label: "b",
      run: b!.run,
    });
    expect(scheduler.cancel(queuedId)).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: "cancelled",
      job: { id: queuedId, state: "cancelled" },
    });
    expect(stateOf(queuedId)).toBeUndefined();
    a!.control.resolve();
    expect(b!.control.started).toBe(0);
  });

  it("cancelling a running job aborts its signal; cancelling holds the slot until the runner settles", async () => {
    const { scheduler, events, stateOf } = setup({
      limits: { importClip: 1, render: 1 },
    });
    const [a, b] = jobs(2);
    const aId = scheduler.enqueue({
      type: "importClip",
      label: "a",
      run: a!.run,
    });
    scheduler.enqueue({ type: "importClip", label: "b", run: b!.run });

    expect(scheduler.cancel(aId)).toBe(true);
    expect(a!.control.context!.signal.aborted).toBe(true);
    expect(stateOf(aId)?.state).toBe("cancelling");
    await flush();
    // The runner has not settled, so a third process must not start yet.
    expect(b!.control.started).toBe(0);
    // Cancelling again is harmless.
    scheduler.cancel(aId);

    a!.control.reject(
      Object.assign(new Error("Aborted"), { name: "AbortError" }),
    );
    await flush();
    expect(events.some((e) => e.type === "cancelled" && e.job.id === aId)).toBe(
      true,
    );
    expect(events.some((e) => e.type === "failed")).toBe(false);
    expect(b!.control.started).toBe(1);
  });

  it("a runner that fails with any error after a cancel request is cancelled, not failed", async () => {
    const { scheduler, events } = setup();
    const { control, run } = controllable();
    const id = scheduler.enqueue({ type: "importClip", label: "a", run });
    scheduler.cancel(id);
    control.reject(new Error("ffmpeg killed: exit 137"));
    await flush();
    expect(events.at(-1)?.type).toBe("cancelled");
  });

  it("a runner that finishes despite a cancel request is reported done", async () => {
    const { scheduler, events } = setup();
    const { control, run } = controllable();
    const id = scheduler.enqueue({ type: "importClip", label: "a", run });
    scheduler.cancel(id);
    control.resolve({ mediaId: "m" });
    await flush();
    expect(events.at(-1)).toMatchObject({
      type: "done",
      job: { result: { mediaId: "m" } },
    });
  });

  it("returns false for unknown or finished ids", async () => {
    const { scheduler } = setup();
    const id = scheduler.enqueue({
      type: "importClip",
      label: "a",
      run: () => undefined,
    });
    await flush();
    expect(scheduler.cancel(id)).toBe(false);
    expect(scheduler.cancel("nope")).toBe(false);
  });

  it("cancelAll drops the queue, aborts running jobs and resolves only after they settle", async () => {
    const { scheduler, events } = setup();
    const all = jobs(4);
    all.forEach(({ run }, i) =>
      scheduler.enqueue({ type: "importClip", label: `c${i}`, run }),
    );

    let resolved = false;
    const done = scheduler.cancelAll().then(() => {
      resolved = true;
    });
    await flush();
    expect(resolved).toBe(false);
    expect(all[0]!.control.context!.signal.aborted).toBe(true);
    expect(all[1]!.control.context!.signal.aborted).toBe(true);
    // Queued jobs were dropped first, so nothing new started.
    expect(all[2]!.control.started).toBe(0);
    expect(all[3]!.control.started).toBe(0);

    all[0]!.control.reject(
      Object.assign(new Error("Aborted"), { name: "AbortError" }),
    );
    await flush();
    expect(resolved).toBe(false);
    all[1]!.control.reject(
      Object.assign(new Error("Aborted"), { name: "AbortError" }),
    );
    await done;
    expect(resolved).toBe(true);
    expect(scheduler.hasActive()).toBe(false);
    expect(events.filter((e) => e.type === "cancelled")).toHaveLength(4);
  });

  it("cancelAll with nothing running resolves", async () => {
    const { scheduler } = setup();
    await expect(scheduler.cancelAll()).resolves.toBeUndefined();
  });
});

describe("job scheduler: events", () => {
  it("emits queued -> started -> progress -> done in order", async () => {
    const { scheduler, events } = setup();
    const { control, run } = controllable();
    scheduler.enqueue({ type: "importClip", label: "a", run });
    control.context!.setProgress(40);
    control.resolve();
    await flush();
    expect(events.map((e) => e.type)).toEqual([
      "queued",
      "started",
      "progress",
      "done",
    ]);
    expect(isTerminalJobState(events.at(-1)!.job.state)).toBe(true);
  });

  it("a queued job is announced at once with state queued", () => {
    const { scheduler, events } = setup({
      limits: { importClip: 1, render: 1 },
    });
    const [a, b] = jobs(2);
    scheduler.enqueue({ type: "importClip", label: "a", run: a!.run });
    scheduler.enqueue({ type: "importClip", label: "b", run: b!.run });
    const queuedB = events.find(
      (e) => e.type === "queued" && e.job.label === "b",
    );
    expect(queuedB?.job.state).toBe("queued");
  });
});
