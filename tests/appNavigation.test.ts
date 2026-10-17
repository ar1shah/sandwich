import { describe, expect, it } from "vitest";
import { isAppPageUrl } from "../src/shared/appNavigation";

describe("isAppPageUrl (dev server)", () => {
  const app = "http://localhost:5173/";

  it("allows the app page, with a hash or query", () => {
    expect(isAppPageUrl("http://localhost:5173/", app)).toBe(true);
    expect(isAppPageUrl("http://localhost:5173/#products", app)).toBe(true);
    expect(isAppPageUrl("http://localhost:5173/?x=1", app)).toBe(true);
  });

  it("blocks other pages, hosts, ports and schemes", () => {
    expect(isAppPageUrl("http://localhost:5173/other", app)).toBe(false);
    expect(isAppPageUrl("http://localhost:5174/", app)).toBe(false);
    expect(isAppPageUrl("https://localhost:5173/", app)).toBe(false);
    expect(isAppPageUrl("https://example.com/", app)).toBe(false);
    expect(isAppPageUrl("file:///Users/me/Movies/clip.mp4", app)).toBe(false);
  });
});

describe("isAppPageUrl (packaged file page)", () => {
  const app =
    "file:///Applications/Sandwich.app/Contents/Resources/app.asar/.vite/renderer/main_window/index.html";

  it("allows the same file", () => {
    expect(isAppPageUrl(app, app)).toBe(true);
    expect(isAppPageUrl(`${app}#x`, app)).toBe(true);
  });

  it("blocks a dropped file and other documents", () => {
    expect(isAppPageUrl("file:///Users/me/Pictures/photo.jpg", app)).toBe(
      false,
    );
    expect(isAppPageUrl("https://example.com/index.html", app)).toBe(false);
  });

  it("blocks anything that is not a URL", () => {
    expect(isAppPageUrl("not a url", app)).toBe(false);
    expect(isAppPageUrl(app, "")).toBe(false);
  });
});
