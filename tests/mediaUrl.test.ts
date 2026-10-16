import { describe, expect, it } from "vitest";
import {
  decodeMediaSegments,
  parseMediaRequestUrl,
} from "../src/shared/mediaPath";
import { mediaUrl } from "../src/shared/mediaUrl";

const base = "http://127.0.0.1:5555/m/tok";

describe("mediaUrl", () => {
  it("joins base and path", () => {
    expect(mediaUrl(base, "clip.mp4")).toBe(`${base}/clip.mp4`);
    expect(mediaUrl(`${base}/`, "a/b.mp4")).toBe(`${base}/a/b.mp4`);
  });

  it("encodes each segment but keeps the separators", () => {
    expect(mediaUrl(base, "my product/clip #1?.mp4")).toBe(
      `${base}/my%20product/clip%20%231%3F.mp4`,
    );
    expect(mediaUrl(base, "café/ü.mp4")).toBe(`${base}/caf%C3%A9/%C3%BC.mp4`);
  });

  it("normalizes backslashes and leading slashes", () => {
    expect(mediaUrl(base, "\\a\\b.mp4")).toBe(`${base}/a/b.mp4`);
    expect(mediaUrl(base, "//a/b.mp4")).toBe(`${base}/a/b.mp4`);
  });

  it.each(["", "a//b", "a/../b", "./a", "a/.", "C:/x", "a\0b", "a/"])(
    "refuses %j",
    (relPath) => {
      expect(() => mediaUrl(base, relPath)).toThrow();
    },
  );

  it("round-trips through the server-side parser", () => {
    const relPath = "p/ro duct/50% off #1.mp4";
    const url = new URL(mediaUrl(base, relPath));
    const parts = parseMediaRequestUrl(url.pathname + url.search);
    expect(parts?.token).toBe("tok");
    expect(decodeMediaSegments(parts?.rawSegments ?? [])).toEqual({
      ok: true,
      segments: ["p", "ro duct", "50% off #1.mp4"],
    });
  });
});
