import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import {
  SETTINGS_GET_CHANNEL,
  SETTINGS_GET_OPEN_DRAFT_CHANNEL,
  SETTINGS_SET_OPEN_DRAFT_CHANNEL,
  SETTINGS_UPDATE_CHANNEL,
} from "../../shared/ipc";
import { VideoIdSchema } from "../../shared/videos";
import type { EditorSettingsService } from "../settings/editorSettingsService";

export function registerSettingsIpc({
  settings,
  assertTrustedSender,
}: {
  settings: EditorSettingsService;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
}): void {
  ipcMain.handle(SETTINGS_GET_CHANNEL, (event) => {
    assertTrustedSender(event);
    return settings.get();
  });
  // The service parses with the strict schema, so a payload with libraryPath (or any
  // other key) comes back as { ok: false }.
  ipcMain.handle(SETTINGS_UPDATE_CHANNEL, (event, patch: unknown) => {
    assertTrustedSender(event);
    return settings.update(patch);
  });
  ipcMain.handle(SETTINGS_GET_OPEN_DRAFT_CHANNEL, (event) => {
    assertTrustedSender(event);
    return settings.getOpenDraft();
  });
  ipcMain.handle(SETTINGS_SET_OPEN_DRAFT_CHANNEL, (event, draftId: unknown) => {
    assertTrustedSender(event);
    return settings.setOpenDraft(
      z.union([VideoIdSchema, z.null()]).parse(draftId),
    );
  });
}
