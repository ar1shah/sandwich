import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { ZodError } from "zod";
import {
  CAPTIONS_BULK_ADD_CHANNEL,
  CAPTIONS_CREATE_CHANNEL,
  CAPTIONS_LIST_CHANNEL,
  CAPTIONS_REMOVE_CHANNEL,
  CAPTIONS_UPDATE_CHANNEL,
} from "../../shared/ipc";
import {
  BulkAddCaptionsInputSchema,
  CaptionIdSchema,
  CreateCaptionInputSchema,
  UpdateCaptionInputSchema,
  type CaptionError,
} from "../../shared/captions";
import type { CaptionService } from "../captions/captionService";

// A payload the renderer's own checks should have caught: answer in the same shape as every
// other user-fixable failure instead of rejecting.
function invalid(error: ZodError): CaptionError {
  return {
    ok: false,
    code: "invalid",
    message: error.issues[0]?.message ?? "Check the caption.",
  };
}

export function registerCaptionsIpc({
  captions,
  assertTrustedSender,
}: {
  captions: CaptionService;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
}): void {
  ipcMain.handle(CAPTIONS_LIST_CHANNEL, (event) => {
    assertTrustedSender(event);
    return captions.list();
  });
  ipcMain.handle(CAPTIONS_CREATE_CHANNEL, (event, input: unknown) => {
    assertTrustedSender(event);
    const parsed = CreateCaptionInputSchema.safeParse(input);
    return parsed.success
      ? captions.create(parsed.data)
      : invalid(parsed.error);
  });
  ipcMain.handle(CAPTIONS_UPDATE_CHANNEL, (event, input: unknown) => {
    assertTrustedSender(event);
    const parsed = UpdateCaptionInputSchema.safeParse(input);
    return parsed.success
      ? captions.update(parsed.data)
      : invalid(parsed.error);
  });
  ipcMain.handle(CAPTIONS_REMOVE_CHANNEL, (event, id: unknown) => {
    assertTrustedSender(event);
    return captions.remove(CaptionIdSchema.parse(id));
  });
  ipcMain.handle(CAPTIONS_BULK_ADD_CHANNEL, (event, input: unknown) => {
    assertTrustedSender(event);
    const parsed = BulkAddCaptionsInputSchema.safeParse(input);
    return parsed.success
      ? captions.bulkAdd(parsed.data)
      : invalid(parsed.error);
  });
}
