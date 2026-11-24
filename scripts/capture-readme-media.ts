// Captures the README screenshots from the PACKAGED app (run `npm run make`
// first). It generates synthetic demo clips with the vendored FFmpeg (no real footage, no
// real people), seeds a throwaway library through the real UI, and writes:
//   docs/screenshots/*.png
// Usage: npm run readme:media
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getFfBinaryName } from "../src/main/media/binaries";
import { packagedExecutable } from "../tests/e2e/launch";

const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "docs", "screenshots");
const WORK = path.join(ROOT, "out", "readme-media");
const MEDIA = path.join(WORK, "media");
const FONT = path.join(ROOT, "assets", "fonts", "TikTokSans36pt-Bold.ttf");
const FFMPEG = path.join(
  ROOT,
  "vendor",
  "ffmpeg",
  `${process.platform}-${process.arch}`,
  getFfBinaryName("ffmpeg", process.platform),
);
const SIZE = { width: 1440, height: 900 };

const PRODUCTS = [
  {
    full: "Glow Vitamin C Serum",
    short: "the serum",
    rgb: ["230+25*sin(P)", "150+60*sin(P+1)", "60+40*sin(P+2)"],
  },
  {
    full: "Cloud Knit Hoodie",
    short: "the hoodie",
    rgb: ["70+40*sin(P)", "110+60*sin(P+1)", "200+40*sin(P+2)"],
  },
  {
    full: "Ember Soy Candle",
    short: "the candle",
    rgb: ["200+40*sin(P)", "70+40*sin(P+1)", "70+30*sin(P+2)"],
  },
] as const;

const CAPTIONS = [
  "before | POV: you finally found {product}",
  "before | I can't fix my smile lines",
  "before | my skin was a mess for months",
  "after | 4 WEEKS later",
  "after | okay but the difference?!",
  "after | no filter, I promise",
  "broll | your sign to try {product}",
  "broll | {product} is back in stock",
  "any | 10/10 {product}",
  "any | this is not an ad (it is)",
].join("\n");

const BEFORE_CAPTION = "POV: you finally found the serum";

function ffmpeg(args: string[]): void {
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", ...args]);
}

// Animated gradient with a big label. `rgb` expressions use P as the moving phase.
function makeClip(
  name: string,
  label: string,
  rgb: readonly string[],
  seconds: number,
): void {
  const p = "((X/W+Y/H*0.8+T*0.4)*3.1416)";
  const [r, g, b] = rgb.map((e) => e.replaceAll("P", p));
  const text = `drawtext=fontfile=${FONT}:text='${label}':fontsize=56:fontcolor=white@0.85:x=(w-text_w)/2:y=h*0.26`;
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    `nullsrc=s=360x640:d=${seconds}:r=30,geq=r='${r}':g='${g}':b='${b}'`,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo",
    "-t",
    String(seconds),
    "-vf",
    `scale=720:1280,${text}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    path.join(MEDIA, `${name}.mp4`),
  ]);
}

function makePhoto(name: string, rgb: readonly string[]): void {
  const p = "((X/W+Y/H)*3.1416)";
  const [r, g, b] = rgb.map((e) => e.replaceAll("P", p));
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    `nullsrc=s=900x900:d=1:r=1,geq=r='${r}':g='${g}':b='${b}'`,
    "-frames:v",
    "1",
    path.join(MEDIA, `${name}.png`),
  ]);
}

function generateMedia(): void {
  mkdirSync(MEDIA, { recursive: true });
  makeClip(
    "before",
    "BEFORE",
    ["50+25*sin(P)", "48+22*sin(P+1)", "58+28*sin(P+2)"],
    12,
  );
  makeClip(
    "after",
    "AFTER",
    ["235+20*sin(P)", "150+60*sin(P+1)", "140+40*sin(P+2)"],
    12,
  );
  makeClip(
    "broll-a",
    "PRODUCT",
    ["60+50*sin(P)", "130+80*sin(P+1)", "230+25*sin(P+2)"],
    8,
  );
  makeClip(
    "broll-b",
    "CLOSE UP",
    ["30+30*sin(P)", "170+60*sin(P+1)", "150+50*sin(P+2)"],
    6,
  );
  PRODUCTS.forEach((product, i) => makePhoto(`product-${i}`, product.rgb));
}

async function launch(
  userDataDir: string,
  libraryDir: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    executablePath: packagedExecutable(),
    env: { ...process.env, SANDWICH_USER_DATA: userDataDir },
  });
  await app.evaluate(
    ({ dialog, BrowserWindow }, args) => {
      dialog.showOpenDialog = () =>
        Promise.resolve({ canceled: false, filePaths: [args.folder] });
      const win = BrowserWindow.getAllWindows()[0];
      win?.setContentSize(args.width, args.height);
      win?.center();
    },
    { folder: libraryDir, ...SIZE },
  );
  const page = await app.firstWindow();
  await page.setViewportSize(SIZE).catch(() => undefined);
  return { app, page };
}

// app.close() waits for the app's own quit flow; fall back to killing it so a capture run
// never hangs.
async function closeApp(app: ElectronApplication): Promise<void> {
  const proc = app.process();
  const closed = app.close().then(() => true);
  const timeout = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), 20_000),
  );
  if (!(await Promise.race([closed, timeout]))) {
    console.log("app.close() timed out, killing the process");
    proc.kill("SIGKILL");
  }
}

const nav = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).first().click();
const slot = (page: Page, name: "before" | "after" | "broll") =>
  page.getByTestId(`slot-${name}`);

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  console.log(`screenshot: ${name}.png`);
}

async function addProduct(
  page: Page,
  index: number,
  first: boolean,
): Promise<void> {
  const product = PRODUCTS[index]!;
  await page
    .getByRole("button", {
      name: first ? "Add your first product" : "Add product",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add product" });
  await dialog.getByLabel("Full name").fill(product.full);
  await dialog.getByLabel(/Short name/).fill(product.short);
  await dialog
    .getByLabel("Product photo file")
    .setInputFiles(path.join(MEDIA, `product-${index}.png`));
  await expect(dialog.getByAltText("Product photo preview")).toBeVisible();
  await dialog.getByRole("button", { name: "Add product" }).click();
  await expect(dialog).toBeHidden();
}

async function openProduct(page: Page, full: string): Promise<void> {
  await nav(page, "Products");
  await page
    .getByRole("listitem")
    .filter({ hasText: full })
    .getByRole("button", { name: new RegExp(full) })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: full, level: 1 }),
  ).toBeVisible();
}

async function importBroll(page: Page, files: string[]): Promise<void> {
  const before = await page.getByTestId("broll-duration").count();
  await page.getByLabel("B-roll files").setInputFiles(files);
  await expect(page.getByTestId("broll-duration")).toHaveCount(
    before + files.length,
    { timeout: 120_000 },
  );
}

async function exportAndWait(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Your video is ready" }),
  ).toBeVisible({ timeout: 300_000 });
}

async function pickBeforeCaption(page: Page): Promise<void> {
  await slot(page, "before").getByRole("heading", { name: "Before" }).click();
  await page.getByTestId("caption-pick").click();
  await page
    .getByRole("dialog", { name: "Choose a caption" })
    .getByRole("option", { name: new RegExp("finally found") })
    .click();
  await expect(page.getByTestId("caption-text")).toHaveValue(BEFORE_CAPTION);
}

// Phase A: seed the library through the UI, take the static screenshots, export one video
// and leave a half-built draft open for phase B.
async function seedAndShoot(
  userDataDir: string,
  libraryDir: string,
): Promise<void> {
  const { app, page } = await launch(userDataDir, libraryDir);
  try {
    await expect(
      page.getByRole("button", { name: "Choose another folder" }),
    ).toBeVisible();
    await shot(page, "welcome");
    await page.getByRole("button", { name: "Choose another folder" }).click();
    await page.getByRole("button", { name: "Use this folder" }).click();
    await expect(
      page.getByRole("heading", { name: "Products", exact: true }),
    ).toBeVisible();

    await addProduct(page, 0, true);
    await addProduct(page, 1, false);
    await addProduct(page, 2, false);

    await openProduct(page, PRODUCTS[0].full);
    await importBroll(page, [
      path.join(MEDIA, "broll-a.mp4"),
      path.join(MEDIA, "broll-b.mp4"),
    ]);
    await shot(page, "product-broll");
    for (const [i, product] of PRODUCTS.entries()) {
      if (i === 0) {
        continue;
      }
      await openProduct(page, product.full);
      await importBroll(page, [path.join(MEDIA, "broll-a.mp4")]);
    }
    await nav(page, "Products");
    await shot(page, "products");

    await nav(page, "Captions");
    await page.getByRole("button", { name: "Bulk add", exact: true }).click();
    const bulk = page.getByRole("dialog", { name: "Bulk add captions" });
    await bulk.getByLabel("Captions, one per line").fill(CAPTIONS);
    await expect(bulk.getByTestId("bulk-line-ok")).toHaveCount(10);
    await bulk.getByRole("button", { name: "Add 10 captions" }).click();
    // With nothing left to fix the dialog may close itself; otherwise press Done.
    await page.waitForTimeout(800);
    if (await bulk.isVisible()) {
      await bulk.getByRole("button", { name: "Done" }).click();
    }
    await expect(bulk).toBeHidden();
    await shot(page, "captions");

    // Video 1: complete, exported, so History has something to show.
    await nav(page, "New Video");
    await page
      .getByRole("option", { name: new RegExp(PRODUCTS[0].full) })
      .click();
    await page
      .getByLabel("Before clip file")
      .setInputFiles(path.join(MEDIA, "before.mp4"));
    await page
      .getByLabel("After clip file")
      .setInputFiles(path.join(MEDIA, "after.mp4"));
    await expect(slot(page, "before")).toHaveAttribute("data-status", "ready", {
      timeout: 120_000,
    });
    await expect(slot(page, "after")).toHaveAttribute("data-status", "ready", {
      timeout: 120_000,
    });
    await slot(page, "broll")
      .getByRole("button", { name: "Choose b-roll" })
      .click();
    await page.getByRole("dialog").getByRole("option").first().click();
    await expect(slot(page, "broll")).toHaveAttribute("data-status", "ready");
    await pickBeforeCaption(page);
    await page.getByTestId("zoom-toggle").click();
    await page.getByTestId("safe-zone-toggle").click();
    await page.waitForTimeout(1200);
    await shot(page, "editor");
    await page.getByTestId("safe-zone-toggle").click();

    await exportAndWait(page);
    await shot(page, "export-done");
    await page.getByRole("button", { name: "New video, same product" }).click();

    // Video 2: a draft with Before and After imported, left open for the GIF.
    await page
      .getByLabel("Before clip file")
      .setInputFiles(path.join(MEDIA, "before.mp4"));
    await page
      .getByLabel("After clip file")
      .setInputFiles(path.join(MEDIA, "after.mp4"));
    await expect(slot(page, "before")).toHaveAttribute("data-status", "ready", {
      timeout: 120_000,
    });
    await expect(slot(page, "after")).toHaveAttribute("data-status", "ready", {
      timeout: 120_000,
    });
    await page.waitForTimeout(1500);

    await nav(page, "History");
    await expect(page.getByTestId("history-row").first()).toBeVisible();
    await shot(page, "history");
    await nav(page, "New Video");
    await page.waitForTimeout(1500);
  } finally {
    await closeApp(app);
  }
}

async function main(): Promise<void> {
  if (!existsSync(packagedExecutable())) {
    throw new Error('No packaged app. Run "npm run make" first.');
  }
  if (!existsSync(FFMPEG)) {
    throw new Error('FFmpeg is missing. Run "npm run ffmpeg:fetch" first.');
  }
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(MEDIA, { recursive: true });
  generateMedia();
  const userDataDir = mkdtempSync(path.join(tmpdir(), "sandwich-readme-user-"));
  const libraryDir = mkdtempSync(path.join(tmpdir(), "sandwich-readme-lib-"));
  await seedAndShoot(userDataDir, libraryDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
