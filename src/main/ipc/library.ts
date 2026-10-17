import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  LIBRARY_ACTIVATE_CHANNEL,
  LIBRARY_CHOOSE_CHANNEL,
  LIBRARY_GET_CHANNEL,
  LIBRARY_MEDIA_BASE_URL_CHANNEL,
} from "../../shared/ipc";
import {
  LibraryActivateOptionsSchema,
  LibraryChooseSourceSchema,
} from "../../shared/library";
import type { LibraryManager } from "../library/libraryManager";

export function registerLibraryIpc({
  manager,
  getMediaBaseUrl,
  assertTrustedSender,
}: {
  manager: LibraryManager;
  getMediaBaseUrl: () => Promise<string>;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
}): void {
  ipcMain.handle(LIBRARY_GET_CHANNEL, (event) => {
    assertTrustedSender(event);
    return manager.getState();
  });
  ipcMain.handle(LIBRARY_CHOOSE_CHANNEL, (event, source: unknown) => {
    assertTrustedSender(event);
    return manager.choose(LibraryChooseSourceSchema.parse(source));
  });
  ipcMain.handle(LIBRARY_ACTIVATE_CHANNEL, (event, options: unknown) => {
    assertTrustedSender(event);
    return manager.activate(LibraryActivateOptionsSchema.parse(options));
  });
  ipcMain.handle(LIBRARY_MEDIA_BASE_URL_CHANNEL, (event) => {
    assertTrustedSender(event);
    return getMediaBaseUrl();
  });
}
