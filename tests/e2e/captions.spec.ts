import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { launchPackagedApp, type LaunchedApp } from "./launch";

let launched: LaunchedApp;
let page: Page;

test.beforeAll(async () => {
  launched = await launchPackagedApp();
  page = await launched.app.firstWindow();
});

test.afterAll(async () => {
  await launched?.app.close();
});

async function shot(name: string) {
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: path.join("test-results", `e2e-${name}.png`) });
}

const rows = () => page.getByTestId("caption-row");

// Five good lines, one repeat of line 3 and one unknown slot.
const PASTE = [
  "before | I can't fix my smile lines, it's genetics",
  "before | My skin looked tired every morning",
  "after | 4 weeks later",
  "broll | your sign to try {product}",
  "any | 10/10 {product}",
  "after |  4 WEEKS later",
  "hook | not a slot",
].join("\n");

test("caption bank: bulk add with an error and a duplicate, filter, edit, delete, product tab", async () => {
  await test.step("pick a library and open the Captions page", async () => {
    await page.getByRole("button", { name: "Choose another folder" }).click();
    await page.getByRole("button", { name: "Use this folder" }).click();
    await page.getByRole("button", { name: "Captions", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No captions yet" }),
    ).toBeVisible();
  });

  await test.step("bulk preview flags the bad slot and the repeat before saving", async () => {
    await page.getByRole("button", { name: "Bulk add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Bulk add captions" });
    await dialog.getByLabel("Captions, one per line").fill(PASTE);
    await expect(dialog.getByTestId("bulk-line-ok")).toHaveCount(5);
    await expect(dialog.getByTestId("bulk-line-error")).toHaveCount(1);
    await expect(dialog.getByTestId("bulk-line-error")).toContainText(
      "Line 7: Unknown slot",
    );
    await expect(dialog.getByTestId("bulk-line-duplicate")).toHaveCount(1);
    await expect(dialog.getByTestId("bulk-line-duplicate")).toContainText(
      "Repeated on line 3.",
    );
    await expect(
      dialog.getByRole("button", { name: "Add 5 captions" }),
    ).toBeEnabled();
    await shot("captions-bulk-preview");
  });

  await test.step("saving adds the 5 good lines and leaves only the bad one in the box", async () => {
    const dialog = page.getByRole("dialog", { name: "Bulk add captions" });
    await dialog.getByRole("button", { name: "Add 5 captions" }).click();
    await expect(dialog.getByRole("status")).toHaveText(
      "Added 5. 1 line needs fixing. 1 duplicate skipped.",
    );
    await expect(dialog.getByLabel("Captions, one per line")).toHaveValue(
      "hook | not a slot",
    );
    await expect(rows()).toHaveCount(5);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();
    // A pasted list keeps its order.
    await expect(rows().first()).toContainText("I can't fix my smile lines");
    await shot("captions-list");
  });

  await test.step("filter by slot and search", async () => {
    const slots = page.getByRole("group", { name: "Slot filter" });
    await slots.getByRole("button", { name: "After", exact: true }).click();
    await expect(rows()).toHaveCount(1);
    await expect(rows().first()).toContainText("4 weeks later");
    await expect(page.getByTestId("caption-count")).toHaveText("1 of 5");
    await slots.getByRole("button", { name: "All slots" }).click();
    await expect(rows()).toHaveCount(5);
    await page.getByLabel("Search captions").fill("smile");
    await expect(rows()).toHaveCount(1);
    await page.getByLabel("Search captions").fill("");
    await expect(rows()).toHaveCount(5);
  });

  await test.step("the form previews tokens, warns on unknown ones and guards unsaved text", async () => {
    await page
      .getByRole("button", { name: "Add caption", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Add caption" });
    await dialog.getByLabel("Text").fill("{brand} rocks, {product} too");
    await expect(dialog.getByTestId("caption-form-preview")).toContainText(
      "{brand} rocks, the example too",
    );
    await expect(dialog.getByRole("note")).toContainText("{brand}");
    await page.keyboard.press("Escape");
    const confirm = page.getByRole("alertdialog", { name: "Discard changes?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await confirm.getByRole("button", { name: "Discard" }).click();
    await expect(dialog).toBeHidden();
    await expect(rows()).toHaveCount(5);
  });

  await test.step("edit one caption", async () => {
    await page
      .getByRole("button", { name: "Edit caption: 4 weeks later" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Edit caption" });
    await dialog.getByLabel("Text").fill("6 weeks later");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(rows().filter({ hasText: "6 weeks later" })).toHaveCount(1);
    await expect(rows().filter({ hasText: "4 weeks later" })).toHaveCount(0);
    await expect(rows()).toHaveCount(5);
  });

  await test.step("delete one caption", async () => {
    await page
      .getByRole("button", { name: "Delete caption: 10/10 {product}" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Delete this caption?" });
    await dialog.getByRole("button", { name: "Delete caption" }).click();
    await expect(dialog).toBeHidden();
    await expect(rows()).toHaveCount(4);
    await expect(rows().filter({ hasText: "10/10" })).toHaveCount(0);
  });

  await test.step("a product's Captions tab shows generic ones and resolves its own", async () => {
    await page.getByRole("button", { name: "Products", exact: true }).click();
    await page.getByRole("button", { name: "Add product" }).first().click();
    const form = page.getByRole("dialog", { name: "Add product" });
    await form.getByLabel("Full name").fill("Levi's 501 Jeans");
    await form.getByLabel("Short name").fill("the 501s");
    await form.getByRole("button", { name: "Add product" }).click();
    await expect(form).toBeHidden();
    await page
      .getByRole("listitem")
      .filter({ hasText: "Levi's 501 Jeans" })
      .getByRole("button", { name: /Levi's 501 Jeans/ })
      .first()
      .click();
    await page.getByRole("tab", { name: "Captions" }).click();
    await expect(
      page.getByRole("list", { name: "Product captions" }).locator("> li"),
    ).toHaveCount(4);

    await page
      .getByRole("button", { name: "Add caption", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Add caption" });
    await expect(dialog.getByLabel("Product")).toHaveValue(/.+/);
    await dialog.getByLabel("Text").fill("{product} changed my wardrobe");
    await expect(dialog.getByTestId("caption-form-preview")).toContainText(
      "the 501s changed my wardrobe",
    );
    await dialog.getByRole("button", { name: "Add caption" }).click();
    await expect(dialog).toBeHidden();
    const own = page
      .getByRole("list", { name: "Product captions" })
      .locator("> li");
    await expect(own).toHaveCount(5);
    // Its own caption sorts first, with the resolved text under it.
    await expect(own.first()).toContainText("the 501s changed my wardrobe");
    await shot("captions-product-tab");
  });

  await test.step("the Captions page can filter by that product", async () => {
    await page.getByRole("button", { name: "Captions", exact: true }).click();
    await page.getByRole("button", { name: "Product..." }).click();
    const picker = page.getByRole("dialog", { name: "Show captions for" });
    await picker
      .getByRole("button", { name: /Levi's 501 Jeans/ })
      .first()
      .click();
    await expect(rows()).toHaveCount(1);
    await expect(rows().first()).toContainText("changed my wardrobe");
  });
});
