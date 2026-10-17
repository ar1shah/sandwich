import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { JOBS_CANCEL_CHANNEL, JOBS_LIST_CHANNEL } from "../../shared/ipc";
import { JobIdSchema } from "../../shared/jobs";
import type { JobService } from "../jobs";

export function registerJobsIpc({
  jobs,
  assertTrustedSender,
}: {
  jobs: JobService;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
}): void {
  ipcMain.handle(JOBS_LIST_CHANNEL, (event) => {
    assertTrustedSender(event);
    return jobs.list();
  });
  ipcMain.handle(JOBS_CANCEL_CHANNEL, (event, jobId: unknown) => {
    assertTrustedSender(event);
    return jobs.cancel(JobIdSchema.parse(jobId));
  });
}
