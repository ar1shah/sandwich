import { describe, expect, it } from "vitest";
import {
  decodeMediaSegments,
  parseMediaRequestUrl,
} from "../src/shared/mediaPath";

describe("parseMediaRequestUrl", () => {
  it("splits token and raw segments", () => {
    expect(parseMediaRequestUrl("/m/tok/a/b%20c.mp4")).toEqual({
      token: "tok",
      rawSegments: ["a", "b%20c.mp4"],
    });
  });

  it("ignores query and fragment", () => {
    expect(parseMediaRequestUrl("/m/tok/a.mp4?x=1#y")?.rawSegments).toEqual([
      "a.mp4",
    ]);
  });

  it("does not collapse dot segments", () => {
    expect(parseMediaRequestUrl("/m/tok/../x")?.rawSegments).toEqual([
      "..",
      "x",
    ]);
  });

  it("rejects other shapes", () => {
    expect(parseMediaRequestUrl(undefined)).toBeNull();
    expect(parseMediaRequestUrl("")).toBeNull();
    expect(parseMediaRequestUrl("/")).toBeNull();
    expect(parseMediaRequestUrl("/x/tok/a")).toBeNull();
    expect(parseMediaRequestUrl("/m")).toBeNull();
    expect(parseMediaRequestUrl("/m//a")).toBeNull();
    expect(parseMediaRequestUrl("http://evil/m/tok/a")).toBeNull();
  });

  it("returns no segments for a bare token", () => {
    expect(parseMediaRequestUrl("/m/tok")?.rawSegments).toEqual([]);
  });
});

describe("decodeMediaSegments", () => {
  it("decodes each segment", () => {
    expect(decodeMediaSegments(["a%20b", "c%C3%A9.mp4"])).toEqual({
      ok: true,
      segments: ["a b", "cé.mp4"],
    });
  });

  it.each([
    ["empty segment", [""]],
    ["dot", ["."]],
    ["dot dot", [".."]],
    ["encoded dot dot", ["%2e%2e"]],
    ["upper-case encoded dot dot", ["%2E%2E"]],
    ["backslash", ["a%5Cb"]],
    ["literal backslash", ["a\\b"]],
    ["encoded slash", ["a%2Fb"]],
    ["NUL", ["a%00b"]],
    ["colon", ["C:"]],
    ["encoded colon", ["C%3A"]],
    ["alternate data stream", ["clip.mp4:stream"]],
    ["no segments", []],
  ])("forbids %s", (_name, segments) => {
    expect(decodeMediaSegments(segments)).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("does not decode twice", () => {
    expect(decodeMediaSegments(["%252e%252e"])).toEqual({
      ok: true,
      segments: ["%2e%2e"],
    });
  });

  it("reports malformed percent-encoding", () => {
    expect(decodeMediaSegments(["%"])).toEqual({
      ok: false,
      reason: "bad-encoding",
    });
    expect(decodeMediaSegments(["a", "%E0%A4%A"])).toEqual({
      ok: false,
      reason: "bad-encoding",
    });
  });
});
