// Limits how often `progress` events reach the renderer. State changes (queued, started,
// done, failed, cancelled) are never dropped or delayed, and a pending progress for a job
// is discarded when a state change for that job goes out. Pure: timers are injected.
import type { JobEvent } from "./jobs";

export type JobEventThrottleOptions = {
  send: (event: JobEvent) => void;
  intervalMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export function createJobEventThrottle({
  send,
  intervalMs = 100,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
}: JobEventThrottleOptions) {
  type Pending = { event: JobEvent; handle: unknown };
  const lastSent = new Map<string, number>();
  const pending = new Map<string, Pending>();

  function sendNow(event: JobEvent): void {
    lastSent.set(event.job.id, now());
    send(event);
  }

  function clearPending(jobId: string): void {
    const entry = pending.get(jobId);
    if (entry) {
      clearTimer(entry.handle);
      pending.delete(jobId);
    }
  }

  return {
    push(event: JobEvent): void {
      const jobId = event.job.id;
      if (event.type !== "progress") {
        clearPending(jobId);
        if (
          event.type === "done" ||
          event.type === "failed" ||
          event.type === "cancelled"
        ) {
          lastSent.delete(jobId);
        } else {
          lastSent.set(jobId, now());
        }
        send(event);
        return;
      }

      const waited = now() - (lastSent.get(jobId) ?? -Infinity);
      if (waited >= intervalMs) {
        clearPending(jobId);
        sendNow(event);
        return;
      }
      // Too soon: keep only the newest progress and send it when the interval is up.
      const existing = pending.get(jobId);
      if (existing) {
        existing.event = event;
        return;
      }
      const entry: Pending = { event, handle: null };
      entry.handle = setTimer(() => {
        pending.delete(jobId);
        sendNow(entry.event);
      }, intervalMs - waited);
      pending.set(jobId, entry);
    },

    // Drops everything not sent yet (window closed).
    dispose(): void {
      for (const entry of pending.values()) {
        clearTimer(entry.handle);
      }
      pending.clear();
      lastSent.clear();
    },
  };
}
