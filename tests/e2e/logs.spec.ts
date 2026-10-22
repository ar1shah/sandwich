import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
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

const logFile = () => path.join(launched.userDataDir, "logs", "sandwich.log");

test("logs: renderer errors reach the log file with the token removed, and Open logs folder works", async () => {
  await test.step("open a library and go to Settings", async () => {
    await page.getByRole("button", { name: "Choose another folder" }).click();
    await page.getByRole("button", { name: "Use this folder" }).click();
    await page
      .getByRole("button", { name: "Add your first product" })
      .waitFor();
    await page
      .getByRole("button", { name: "Settings", exact: true })
      .first()
      .click();
  });

  await test.step("the log file exists after launch", async () => {
    await expect.poll(() => existsSync(logFile())).toBe(true);
  });

  await test.step("an error outside React is logged by the window listener, redacted", async () => {
    await page.evaluate(() => {
      const message =
        "e2e boom http://127.0.0.1:1/m/AbCdEfGh_ijklMNOP-qrstuvwxyz012345/clips/a.mp4";
      window.dispatchEvent(
        new ErrorEvent("error", { message, error: new Error(message) }),
      );
    });
    await expect
      .poll(() => readFileSync(logFile(), "utf8"))
      .toContain("[renderer] e2e boom");
    const text = readFileSync(logFile(), "utf8");
    expect(text).toContain("/m/[token]/clips/a.mp4");
    expect(text).not.toContain("AbCdEfGh");
  });

  await test.step("an unhandled rejection is logged too", async () => {
    await page.evaluate(() => {
      const event = new Event("unhandledrejection") as Event & {
        reason: unknown;
      };
      event.reason = new Error("e2e rejected");
      window.dispatchEvent(event);
    });
    await expect
      .poll(() => readFileSync(logFile(), "utf8"))
      .toContain("Unhandled rejection: e2e rejected");
  });

  await test.step("Open logs folder asks main to open userData/logs", async () => {
    await launched.app.evaluate(({ shell }) => {
      const g = globalThis as { __opened?: string[] };
      g.__opened = [];
      shell.openPath = async (p: string) => {
        g.__opened?.push(p);
        return "";
      };
    });
    await page.getByRole("button", { name: "Open logs folder" }).click();
    await expect
      .poll(() =>
        launched.app.evaluate(
          () => (globalThis as { __opened?: string[] }).__opened ?? [],
        ),
      )
      .toEqual([path.join(launched.userDataDir, "logs")]);
  });

  await test.step("a failure to open the folder is shown", async () => {
    await launched.app.evaluate(({ shell }) => {
      shell.openPath = async () => "No application can open this folder.";
    });
    await page.getByRole("button", { name: "Open logs folder" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "No application can open this folder.",
    );
  });
});
