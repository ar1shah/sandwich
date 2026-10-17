import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { jpegSize } from "../../src/shared/jpegSize";
import { launchPackagedApp, type LaunchedApp } from "./launch";
import { makePng } from "./png";

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

test("create with an image, search, edit and delete a product", async () => {
  const productsDir = path.join(launched.libraryDir, "products");

  await test.step("first launch picks a library", async () => {
    await page.getByRole("button", { name: "Choose another folder" }).click();
    await page.getByRole("button", { name: "Use this folder" }).click();
    await expect(
      page.getByRole("heading", { name: "Products", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("No products yet")).toBeVisible();
    await shot("empty");
  });

  await test.step("create a product with a photo", async () => {
    await page.getByRole("button", { name: "Add your first product" }).click();
    const dialog = page.getByRole("dialog", { name: "Add product" });
    await dialog.getByLabel("Full name").fill("Levi's 501 Original Fit Jeans");
    await dialog.getByLabel(/Short name/).fill("the 501s");
    await expect(dialog.getByLabel("Slug")).toHaveValue(
      "levis-501-original-fit-jeans",
    );
    await expect(dialog.getByTestId("caption-preview")).toContainText(
      "10/10 the 501s",
    );
    await dialog.getByLabel("Product photo file").setInputFiles({
      name: "jeans.png",
      mimeType: "image/png",
      buffer: makePng(1200, 900, [30, 60, 160]),
    });
    await expect(dialog.getByAltText("Product photo preview")).toBeVisible();
    await shot("form");
    await dialog.getByRole("button", { name: "Add product" }).click();
    await expect(dialog).toBeHidden();

    const card = page.getByRole("listitem").filter({ hasText: "Levi's 501" });
    await expect(card).toBeVisible();
    await expect(card.getByText("the 501s")).toBeVisible();
    await expect(card.getByText("No b-roll yet")).toBeVisible();
    // The photo loaded through the media server.
    await expect(card.locator("img")).toHaveJSProperty("complete", true);
    expect(
      await card
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBe(800);
    await shot("grid");
  });

  await test.step("the photo on disk is a resized JPEG", () => {
    const ids = readdirSync(productsDir);
    expect(ids).toHaveLength(1);
    const file = path.join(productsDir, ids[0] ?? "", "image.jpg");
    expect(jpegSize(readFileSync(file))).toEqual({ width: 800, height: 600 });
  });

  await test.step("search finds it by short name and shows no results for nonsense", async () => {
    const search = page.getByRole("searchbox", { name: "Search products" });
    await search.fill("501s");
    await expect(
      page.getByRole("listitem").filter({ hasText: "Levi's 501" }),
    ).toBeVisible();
    await search.fill("zzzz");
    await expect(page.getByText(/No products match/)).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
    await search.fill("");
    await expect(
      page.getByRole("listitem").filter({ hasText: "Levi's 501" }),
    ).toBeVisible();
  });

  await test.step("edit the name; the slug does not follow", async () => {
    const card = page.getByRole("listitem").filter({ hasText: "Levi's 501" });
    await card.hover();
    await card.getByRole("button", { name: /^Edit / }).click();
    const dialog = page.getByRole("dialog", { name: "Edit product" });
    await expect(dialog.getByLabel("Full name")).toHaveValue(
      "Levi's 501 Original Fit Jeans",
    );
    await dialog.getByLabel("Full name").fill("Levi's 501 Jeans");
    await expect(dialog.getByLabel("Slug")).toHaveValue(
      "levis-501-original-fit-jeans",
    );
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Levi's 501 Jeans" }),
    ).toBeVisible();
    await expect(page.getByText("Original Fit")).toHaveCount(0);
  });

  await test.step("delete it after the confirm dialog", async () => {
    const card = page
      .getByRole("listitem")
      .filter({ hasText: "Levi's 501 Jeans" });
    await card.hover();
    await card.getByRole("button", { name: /^Delete / }).click();
    const dialog = page.getByRole("dialog", { name: "Delete product" });
    await expect(dialog).toContainText("No b-roll or captions depend on it");
    await shot("delete");
    await dialog.getByRole("button", { name: "Delete product" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("No products yet")).toBeVisible();
    expect(existsSync(productsDir) ? readdirSync(productsDir) : []).toEqual([]);
  });
});
