import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  BROLL_IMPORT_CHANNEL,
  BROLL_LIST_CHANNEL,
  BROLL_REMOVE_CHANNEL,
} from "../../shared/ipc";
import { BrollIdSchema } from "../../shared/broll";
import { ImportBrollInputSchema } from "../../shared/jobs";
import { ProductIdSchema } from "../../shared/products";
import type { BrollService } from "../broll/brollService";

export function registerBrollIpc({
  broll,
  assertTrustedSender,
}: {
  broll: BrollService;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
}): void {
  ipcMain.handle(BROLL_LIST_CHANNEL, (event, productId: unknown) => {
    assertTrustedSender(event);
    return broll.list(ProductIdSchema.parse(productId));
  });
  // The renderer sends absolute paths (DECISIONS #31). Shape and extension are checked here;
  // ffmpeg opens them read-only, so a bad path just fails that one job.
  ipcMain.handle(BROLL_IMPORT_CHANNEL, (event, input: unknown) => {
    assertTrustedSender(event);
    const { productId, filePaths } = ImportBrollInputSchema.parse(input);
    return broll.importFiles(productId, filePaths);
  });
  ipcMain.handle(BROLL_REMOVE_CHANNEL, (event, id: unknown) => {
    assertTrustedSender(event);
    return broll.remove(BrollIdSchema.parse(id));
  });
}
