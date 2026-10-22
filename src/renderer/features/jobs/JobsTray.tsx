import { useEffect, useMemo } from "react";
import type { JobInfo } from "../../../shared/jobs";
import { selectActive, selectFinished, useJobsStore } from "./jobsStore";

function stateText(job: JobInfo): string {
  switch (job.state) {
    case "queued":
      return "Waiting";
    case "cancelling":
      return "Cancelling";
    default:
      return job.stage ?? "Working";
  }
}

const ActiveRow: React.FC<{ job: JobInfo; onCancel: () => void }> = ({
  job,
  onCancel,
}) => {
  const queued = job.state === "queued";
  const cancelling = job.state === "cancelling";
  return (
    <li className="rounded-md bg-white/5 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs" title={job.label}>
          {job.label}
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          aria-label={`Cancel ${job.label}`}
          className="shrink-0 text-xs text-app-muted hover:text-app-text disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-app-dim">
        <span>{stateText(job)}</span>
        {!queued && <span>{Math.round(job.percent)}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={job.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={queued ? undefined : Math.round(job.percent)}
        className="mt-1 h-1 overflow-hidden rounded bg-white/10"
      >
        <div
          className="h-full bg-brand"
          style={{ width: `${queued ? 0 : job.percent}%` }}
        />
      </div>
    </li>
  );
};

const FinishedRow: React.FC<{ job: JobInfo; onDismiss: () => void }> = ({
  job,
  onDismiss,
}) => {
  const failed = job.state === "failed";
  return (
    <li className="px-3 py-1 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-app-muted" title={job.label}>
          {job.label}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={failed ? "text-red-400" : "text-app-dim"}>
            {failed ? "Failed" : "Done"}
          </span>
          {failed && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={`Dismiss ${job.label}`}
              className="text-app-muted hover:text-app-text"
            >
              Dismiss
            </button>
          )}
        </span>
      </div>
      {failed && job.error && (
        <p
          className="mt-0.5 line-clamp-2 break-words text-red-400/80"
          title={job.error}
        >
          {job.error}
        </p>
      )}
    </li>
  );
};

export const JobsTray: React.FC = () => {
  const jobs = useJobsStore((state) => state.jobs);
  const dismissed = useJobsStore((state) => state.dismissed);
  const dismiss = useJobsStore((state) => state.dismiss);
  const start = useJobsStore((state) => state.start);
  const cancel = useJobsStore((state) => state.cancel);
  const importFixtures = useJobsStore((state) => state.importFixtures);

  useEffect(() => start(), [start]);

  const active = useMemo(() => selectActive(jobs), [jobs]);
  const finished = useMemo(
    () => selectFinished(jobs, dismissed),
    [jobs, dismissed],
  );
  // Temporary 2.2 test button; Vite strips it from production builds.
  const showDevButton = import.meta.env.DEV;

  if (active.length === 0 && finished.length === 0 && !showDevButton) {
    return null;
  }
  return (
    <section
      aria-label="Jobs"
      className="max-h-72 overflow-y-auto border-t border-edge px-3 py-3"
    >
      {showDevButton && (
        <button
          type="button"
          onClick={() => void importFixtures()}
          className="mb-2 w-full rounded-md border border-dashed border-edge px-2 py-1 text-[11px] text-app-dim hover:text-app-text"
        >
          Dev: import all fixtures
        </button>
      )}
      {active.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {active.map((job) => (
            <ActiveRow
              key={job.id}
              job={job}
              onCancel={() => void cancel(job.id)}
            />
          ))}
        </ul>
      )}
      {finished.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {finished.map((job) => (
            <FinishedRow
              key={job.id}
              job={job}
              onDismiss={() => dismiss(job.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
};
