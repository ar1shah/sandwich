import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { ZodError } from "zod";
import {
  PRODUCTS_ARCHIVE_CHANNEL,
  PRODUCTS_CREATE_CHANNEL,
  PRODUCTS_LIST_CHANNEL,
  PRODUCTS_REMOVE_CHANNEL,
  PRODUCTS_TOUCH_CHANNEL,
  PRODUCTS_UPDATE_CHANNEL,
} from "../../shared/ipc";
import {
  CreateProductInputSchema,
  ProductIdSchema,
  UpdateProductInputSchema,
  type ProductError,
  type ProductErrorField,
} from "../../shared/products";
import type { ProductService } from "../products/productService";

const FIELDS: readonly string[] = [
  "fullName",
  "shortName",
  "slug",
  "image",
] satisfies ProductErrorField[];

// A payload the renderer's own checks should have caught: answer in the same shape as
// every other user-fixable failure instead of rejecting.
function invalid(error: ZodError): ProductError {
  const issue = error.issues[0];
  const last = issue?.path[issue.path.length - 1];
  return {
    ok: false,
    code: "invalid",
    field:
      typeof last === "string" && FIELDS.includes(last)
        ? (last as ProductErrorField)
        : null,
    message: issue?.message ?? "Check the product details.",
  };
}

export function registerProductsIpc({
  products,
  assertTrustedSender,
}: {
  products: ProductService;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
}): void {
  ipcMain.handle(PRODUCTS_LIST_CHANNEL, (event) => {
    assertTrustedSender(event);
    return products.list();
  });
  ipcMain.handle(PRODUCTS_CREATE_CHANNEL, (event, input: unknown) => {
    assertTrustedSender(event);
    const parsed = CreateProductInputSchema.safeParse(input);
    return parsed.success
      ? products.create(parsed.data)
      : invalid(parsed.error);
  });
  ipcMain.handle(PRODUCTS_UPDATE_CHANNEL, (event, input: unknown) => {
    assertTrustedSender(event);
    const parsed = UpdateProductInputSchema.safeParse(input);
    return parsed.success
      ? products.update(parsed.data)
      : invalid(parsed.error);
  });
  ipcMain.handle(PRODUCTS_REMOVE_CHANNEL, (event, id: unknown) => {
    assertTrustedSender(event);
    return products.remove(ProductIdSchema.parse(id));
  });
  ipcMain.handle(PRODUCTS_ARCHIVE_CHANNEL, (event, id: unknown) => {
    assertTrustedSender(event);
    return products.archive(ProductIdSchema.parse(id));
  });
  ipcMain.handle(PRODUCTS_TOUCH_CHANNEL, (event, id: unknown) => {
    assertTrustedSender(event);
    return products.touchLastUsed(ProductIdSchema.parse(id));
  });
}
