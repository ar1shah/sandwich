import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import {
  VIDEOS_GET_CHANNEL,
  VIDEOS_LIST_CHANNEL,
  VIDEOS_REMOVE_CHANNEL,
  VIDEOS_SAVE_DRAFT_CHANNEL,
} from "../../shared/ipc";
import { VIDEO_STATUSES } from "../../shared/library";
import { SaveDraftInputSchema, VideoIdSchema } from "../../shared/videos";
import type { VideoService } from "../videos/videoService";

const ListOptionsSchema = z
  .object({ status: z.enum(VIDEO_STATUSES).optional() })
  .optional();

export function registerVideosIpc({
  videos,
  assertTrustedSender,
}: {
  videos: VideoService;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
}): void {
  ipcMain.handle(VIDEOS_SAVE_DRAFT_CHANNEL, (event, recipe: unknown) => {
    assertTrustedSender(event);
    const parsed = SaveDraftInputSchema.safeParse(recipe);
    if (!parsed.success) {
      return {
        ok: false,
        code: "invalid",
        message: parsed.error.issues[0]?.message ?? "The recipe is not valid.",
      };
    }
    return videos.saveDraft(parsed.data);
  });
  ipcMain.handle(VIDEOS_LIST_CHANNEL, (event, options: unknown) => {
    assertTrustedSender(event);
    return videos.list(ListOptionsSchema.parse(options) ?? {});
  });
  ipcMain.handle(VIDEOS_GET_CHANNEL, (event, id: unknown) => {
    assertTrustedSender(event);
    return videos.get(VideoIdSchema.parse(id));
  });
  ipcMain.handle(VIDEOS_REMOVE_CHANNEL, (event, id: unknown) => {
    assertTrustedSender(event);
    return videos.remove(VideoIdSchema.parse(id));
  });
}
