// The job queue's brain: queueing, per-type concurrency, cancellation state. Pure (no
// Node, DOM or Electron): the actual work is a closure passed to enqueue(), so tests drive
// it with fake runners.
import {
  isAbortLikeError,
  isTerminalJobState,
  JOB_LIMITS,
  JOB_TYPES,
  type JobEvent,
  type JobEventType,
  type JobInfo,
  type JobResult,
  type JobType,
} from "./jobs";

export type JobRunContext = {
  jobId: string;
  signal: AbortSignal;
  // Percent 0..100 (clamped, never goes down) and an optional stage label.
  setProgress: (percent: number, stage?: string) => void;
};

export type JobRunner = (
  context: JobRunContext,
) => Promise<JobResult | void> | JobResult | void;

export type EnqueueInput = {
  type: JobType;
  label: string;
  run: JobRunner;
};

export type JobSchedulerOptions = {
  limits?: Record<JobType, number>;
  // Job types that have a runner. Enqueuing any other type throws.
  enabledTypes?: readonly JobType[];
  // Finished (done or failed) jobs kept for snapshot().
  historyLimit?: number;
  onEvent?: (event: JobEvent) => void;
  now?: () => string;
  newId?: () => string;
};

type Entry = {
  info: JobInfo;
  run: JobRunner;
  controller: AbortController;
  // Resolves once the runner has settled and the slot is free. Only set while running.
  settled: Promise<void> | null;
};

export function createJobScheduler(options: JobSchedulerOptions = {}) {
  const limits = options.limits ?? JOB_LIMITS;
  const enabled = new Set<JobType>(options.enabledTypes ?? JOB_TYPES);
  const historyLimit = options.historyLimit ?? 20;
  const now = options.now ?? (() => new Date().toISOString());
  let nextId = 0;
  const newId = options.newId ?? (() => `job-${++nextId}`);
  let seq = 0;
  let order = 0;

  // All live jobs by id: queued, running or cancelling.
  const live = new Map<string, Entry>();
  const queues = new Map<JobType, Entry[]>(JOB_TYPES.map((t) => [t, []]));
  const running = new Map<JobType, Set<Entry>>(
    JOB_TYPES.map((t) => [t, new Set()]),
  );
  const history: JobInfo[] = [];

  function emit(type: JobEventType, entry: Entry): void {
    entry.info = { ...entry.info, seq: ++seq, updatedAt: now() };
    options.onEvent?.({ type, job: { ...entry.info } });
  }

  function finish(
    entry: Entry,
    type: "done" | "failed" | "cancelled",
    patch: Partial<JobInfo> = {},
  ): void {
    entry.info = { ...entry.info, ...patch, state: type };
    if (type === "done") {
      entry.info.percent = 100;
    }
    live.delete(entry.info.id);
    emit(type, entry);
    if (type !== "cancelled") {
      history.push({ ...entry.info });
      if (history.length > historyLimit) {
        history.splice(0, history.length - historyLimit);
      }
    }
  }

  function start(entry: Entry): void {
    const pool = running.get(entry.info.type);
    pool?.add(entry);
    entry.info = { ...entry.info, state: "running" };
    emit("started", entry);

    const context: JobRunContext = {
      jobId: entry.info.id,
      signal: entry.controller.signal,
      setProgress: (percent, stage) => {
        if (entry.info.state !== "running") {
          return;
        }
        const next = Math.min(
          100,
          Math.max(entry.info.percent, Number.isFinite(percent) ? percent : 0),
        );
        if (next === entry.info.percent && stage === entry.info.stage) {
          return;
        }
        entry.info = { ...entry.info, percent: next, stage };
        emit("progress", entry);
      },
    };

    const settled = (async () => {
      try {
        const result = await entry.run(context);
        // A runner that finished despite a cancel request really did finish: keep it.
        finish(entry, "done", result ? { result } : {});
      } catch (error) {
        if (entry.controller.signal.aborted || isAbortLikeError(error)) {
          finish(entry, "cancelled");
        } else {
          finish(entry, "failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        // The slot frees only now, after the runner settled (also while cancelling).
        pool?.delete(entry);
        entry.settled = null;
        pump(entry.info.type);
      }
    })();
    // A runner that throws synchronously has already settled and left the pool by now.
    if (pool?.has(entry)) {
      entry.settled = settled;
    }
  }

  function pump(type: JobType): void {
    const queue = queues.get(type);
    const pool = running.get(type);
    if (!queue || !pool) {
      return;
    }
    while (pool.size < (limits[type] ?? 1) && queue.length > 0) {
      const next = queue.shift();
      if (next) {
        start(next);
      }
    }
  }

  function cancelEntry(entry: Entry): Promise<void> {
    const { state, type } = entry.info;
    if (state === "queued") {
      const queue = queues.get(type) ?? [];
      queue.splice(queue.indexOf(entry), 1);
      finish(entry, "cancelled");
      return Promise.resolve();
    }
    if (state === "running") {
      entry.info = { ...entry.info, state: "cancelling" };
      emit("progress", entry);
      entry.controller.abort();
    }
    return entry.settled ?? Promise.resolve();
  }

  return {
    enqueue(input: EnqueueInput): string {
      if (!enabled.has(input.type)) {
        throw new Error(`Job type "${input.type}" is not available yet.`);
      }
      const entry: Entry = {
        info: {
          id: newId(),
          type: input.type,
          label: input.label,
          state: "queued",
          percent: 0,
          seq: 0,
          order: ++order,
          updatedAt: now(),
        },
        run: input.run,
        controller: new AbortController(),
        settled: null,
      };
      live.set(entry.info.id, entry);
      queues.get(input.type)?.push(entry);
      emit("queued", entry);
      pump(input.type);
      return entry.info.id;
    },

    // Queued: dropped at once. Running: aborted; the job reads `cancelling` and keeps its
    // slot until the runner settles. Unknown or finished ids return false.
    cancel(id: string): boolean {
      const entry = live.get(id);
      if (!entry || isTerminalJobState(entry.info.state)) {
        return false;
      }
      void cancelEntry(entry);
      return true;
    },

    // Cancels everything. Resolves only after every running runner has settled (so child
    // processes are gone and files can be deleted).
    async cancelAll(): Promise<void> {
      const entries = [...live.values()];
      // Queued first so nothing new starts while running jobs wind down.
      const queued = entries.filter((e) => e.info.state === "queued");
      const active = entries.filter((e) => e.info.state !== "queued");
      await Promise.all([...queued, ...active].map(cancelEntry));
    },

    hasActive(): boolean {
      return live.size > 0;
    },

    // Active jobs in creation order, then the most recent finished ones.
    snapshot(): JobInfo[] {
      const active = [...live.values()].map((entry) => ({ ...entry.info }));
      return [...history.map((info) => ({ ...info })), ...active];
    },
  };
}

export type JobScheduler = ReturnType<typeof createJobScheduler>;
