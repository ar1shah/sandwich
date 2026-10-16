import { describe, expect, it } from "vitest";
import { checkNormalized } from "../src/shared/normalizeCheck";
import { makeProbe } from "./helpers/probe";

const source = makeProbe({
  isHdr: true,
  codec: "hevc",
  fps: 60,
  colorTransfer: "arib-std-b67",
  colorSpace: "bt2020nc",
  colorPrimaries: "bt2020",
  pixFmt: "yuv420p10le",
  duration: 6.35,
});
const good = makeProbe({ duration: 6.35, audioDuration: 6.36 });

function failures(output = good, src = source): string[] {
  return checkNormalized(src, output)
    .filter((check) => !check.ok)
    .map((check) => check.name);
}

describe("checkNormalized", () => {
  it("passes a correct working file", () => {
    expect(failures()).toEqual([]);
  });

  it("flags wrong codec, pixel format and frame rate", () => {
    expect(failures({ ...good, codec: "hevc" })).toContain("codec");
    expect(failures({ ...good, pixFmt: "yuv420p10le" })).toContain("pix_fmt");
    expect(failures({ ...good, fps: 60 })).toContain("fps");
    expect(failures({ ...good, isVfr: true })).toContain("fps");
  });

  it("flags leftover HDR or wrong color tags", () => {
    expect(
      failures({ ...good, isHdr: true, colorTransfer: "arib-std-b67" }),
    ).toEqual(expect.arrayContaining(["not HDR", "color transfer"]));
    expect(failures({ ...good, colorSpace: "bt2020nc" })).toContain(
      "color space",
    );
    expect(failures({ ...good, colorPrimaries: null })).toContain(
      "color primaries",
    );
    expect(failures({ ...good, colorRange: "pc" })).toContain("color range");
  });

  it("flags oversize, odd size and leftover rotation", () => {
    expect(failures({ ...good, width: 2160, height: 3840 })).toContain(
      "long edge",
    );
    expect(failures({ ...good, width: 1081 })).toContain("even size");
    expect(failures({ ...good, rotation: 90 })).toContain("rotation baked");
  });

  it("accepts a size within 1 px of the ideal and rejects more", () => {
    const odd = makeProbe({
      width: 884,
      height: 1920,
      displayWidth: 884,
      displayHeight: 1920,
      duration: 8,
      audioDuration: 8,
    });
    const screen = makeProbe({
      displayWidth: 1206,
      displayHeight: 2622,
      width: 1206,
      height: 2622,
    });
    expect(failures(odd, screen)).toEqual([]);
    expect(failures({ ...odd, width: 886 }, screen)).toContain("size");
    expect(failures({ ...odd, width: 882 }, screen)).toContain("size");
    // Rotated source: judged by its display size, not its coded size.
    const rotated = makeProbe({
      width: 1920,
      height: 1080,
      rotation: 270,
      displayWidth: 1080,
      displayHeight: 1920,
    });
    expect(failures(makeProbe(), rotated)).toEqual([]);
    expect(
      failures(makeProbe({ width: 1920, height: 1080 }), rotated),
    ).toContain("size");
  });

  it("checks duration against the source", () => {
    expect(failures({ ...good, duration: 6.4, audioDuration: 6.4 })).toEqual(
      [],
    );
    expect(failures({ ...good, duration: 6.6, audioDuration: 6.6 })).toContain(
      "duration",
    );
  });

  it("checks the audio stream", () => {
    expect(
      failures({
        ...good,
        hasAudio: false,
        audioStreamIndex: null,
        audioCodec: null,
        audioChannels: null,
        audioSampleRate: null,
        audioDuration: null,
      }),
    ).toEqual(
      expect.arrayContaining([
        "audio present",
        "audio codec",
        "audio format",
        "audio vs video duration",
      ]),
    );
    expect(failures({ ...good, audioChannels: 1 })).toContain("audio format");
    expect(failures({ ...good, audioSampleRate: 44100 })).toContain(
      "audio format",
    );
  });

  it("requires audio within one frame of the video", () => {
    expect(failures({ ...good, audioDuration: 6.38 })).toEqual([]);
    expect(failures({ ...good, audioDuration: 6.5 })).toContain(
      "audio vs video duration",
    );
  });
});
