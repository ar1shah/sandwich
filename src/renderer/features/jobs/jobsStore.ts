import { create } from "zustand";
import {
  isTerminalJobState,
  type JobEvent,
  type JobInfo,
} from "../../../shared/jobs";

// Finished (done or failed) jobs kept for the tray.
export const RECENT_FINISHED_LIMIT = 5;
// Cancelled jobs are hidden but kept briefly: a stale snapshot must not resurrect them.
const CANCELLED_KEEP = 50;

// Keep the newer of two copies of the same job. `seq` only grows, so an old snapshot never
// overwrites a newer event.
export function mergeJob(
  jobs: Record<string, JobInfo>,
  incoming: JobInfo,
): Record<string, JobInfo> {
  const current = jobs[incoming.id];
  if (current && current.seq >= incoming.seq) {
    return jobs;
  }
  return { ...jobs, [incoming.id]: incoming };
}

function prune(jobs: Record<string, JobInfo>): Record<string, JobInfo> {
  const byRecent = Object.values(jobs).sort((a, b) => b.seq - a.seq);
  const keep = new Set<string>();
  let finished = 0;
  let cancelled = 0;
  for (const job of byRecent) {
    if (!isTerminalJobState(job.state)) {
      keep.add(job.id);
    } else if (job.state === "cancelled") {
      if (cancelled++ < CANCELLED_KEEP) {
        keep.add(job.id);
      }
    } else if (finished++ < RECENT_FINISHED_LIMIT) {
      keep.add(job.id);
    }
  }
  if (keep.size === byRecent.length) {
    return jobs;
  }
  return Object.fromEntries(
    Object.entries(jobs).filter(([id]) => keep.has(id)),
  );
}

type JobsStore = {
  jobs: Record<string, JobInfo>;
  applyEvent: (event: JobEvent) => void;
  applySnapshot: (snapshot: JobInfo[]) => void;
  // Subscribes first, then loads the snapshot, so nothing is missed in between.
  // Returns the unsubscribe function.
  start: () => () => void;
  cancel: (jobId: string) => Promise<void>;
  importFixtures: () => Promise<void>;
};

export const useJobsStore = create<JobsStore>((set, get) => ({
  jobs: {},

  applyEvent(event) {
    set((state) => ({ jobs: prune(mergeJob(state.jobs, event.job)) }));
  },

  applySnapshot(snapshot) {
    set((state) => ({
      jobs: prune(snapshot.reduce(mergeJob, state.jobs)),
    }));
  },

  start() {
    const off = window.api.jobs.onEvent((event) => get().applyEvent(event));
    void window.api.jobs
      .list()
      .then((snapshot) => get().applySnapshot(snapshot))
      .catch(() => undefined);
    return off;
  },

  async cancel(jobId) {
    await window.api.jobs.cancel(jobId).catch(() => false);
  },

  async importFixtures() {
    await window.api.dev.importFixtures();
  },
}));

// Queued, running and cancelling jobs, oldest first.
export function selectActive(jobs: Record<string, JobInfo>): JobInfo[] {
  return Object.values(jobs)
    .filter((job) => !isTerminalJobState(job.state))
    .sort((a, b) => a.order - b.order);
}

// Done and failed, newest first. Cancelled jobs are not shown.
export function selectFinished(jobs: Record<string, JobInfo>): JobInfo[] {
  return Object.values(jobs)
    .filter((job) => job.state === "done" || job.state === "failed")
    .sort((a, b) => b.seq - a.seq);
}
