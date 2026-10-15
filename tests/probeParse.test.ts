import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRotation,
  isHdrTransfer,
  isVariableFrameRate,
  normalizeRotation,
  parseFrameRate,
  parseProbeJson,
  parseRecordedDate,
} from "../src/shared/probeParse";

function loadSample(name: string): unknown {
  return JSON.parse(
    readFileSync(
      path.join(__dirname, "fixtures", "probe", `${name}.json`),
      "utf8",
    ),
  );
}

describe("parseFrameRate", () => {
  it("parses fractions and integers", () => {
    expect(parseFrameRate("30/1")).toBe(30);
    expect(parseFrameRate("30000/1001")).toBeCloseTo(29.97, 2);
    expect(parseFrameRate("60")).toBe(60);
  });

  it("returns null for empty or invalid values", () => {
    expect(parseFrameRate("0/0")).toBeNull();
    expect(parseFrameRate(undefined)).toBeNull();
    expect(parseFrameRate("abc")).toBeNull();
  });
});

describe("normalizeRotation", () => {
  it("wraps negatives and snaps to quarter turns", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(-180)).toBe(180);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-89.9)).toBe(270);
  });
});

describe("getRotation", () => {
  it("reads iPhone portrait display matrix (-90) as 90 clockwise", () => {
    expect(
      getRotation({
        side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
      }),
    ).toBe(90);
  });

  it("reads a counter-clockwise 90 matrix as 270 clockwise", () => {
    expect(
      getRotation({
        side_data_list: [{ side_data_type: "Display Matrix", rotation: 90 }],
      }),
    ).toBe(270);
  });

  it("handles 180 in either sign", () => {
    expect(
      getRotation({
        side_data_list: [{ side_data_type: "Display Matrix", rotation: -180 }],
      }),
    ).toBe(180);
    expect(
      getRotation({
        side_data_list: [{ side_data_type: "Display Matrix", rotation: 180 }],
      }),
    ).toBe(180);
  });

  it("falls back to the legacy clockwise rotate tag", () => {
    expect(getRotation({ tags: { rotate: "90" } })).toBe(90);
    expect(getRotation({ tags: { rotate: "270" } })).toBe(270);
  });

  it("prefers the display matrix over the rotate tag", () => {
    expect(
      getRotation({
        tags: { rotate: "180" },
        side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
      }),
    ).toBe(90);
  });

  it("ignores unrelated side data and defaults to 0", () => {
    expect(
      getRotation({
        side_data_list: [{ side_data_type: "Mastering display metadata" }],
      }),
    ).toBe(0);
    expect(getRotation({})).toBe(0);
  });
});

describe("isHdrTransfer", () => {
  it("flags HLG and PQ only", () => {
    expect(isHdrTransfer("arib-std-b67")).toBe(true);
    expect(isHdrTransfer("smpte2084")).toBe(true);
    expect(isHdrTransfer("bt709")).toBe(false);
    expect(isHdrTransfer(null)).toBe(false);
  });
});

describe("isVariableFrameRate", () => {
  it("allows small drift but flags real differences", () => {
    expect(isVariableFrameRate(30, 30)).toBe(false);
    expect(isVariableFrameRate(30, 29.85)).toBe(false);
    expect(isVariableFrameRate(30, 17.86)).toBe(true);
    expect(isVariableFrameRate(null, 30)).toBe(false);
  });
});

describe("parseRecordedDate", () => {
  it("parses Apple offsets without a colon", () => {
    expect(parseRecordedDate("2024-05-12T14:33:21-0700")).toBe(
      "2024-05-12T21:33:21.000Z",
    );
  });

  it("parses creation_time in UTC", () => {
    expect(parseRecordedDate("2024-05-12T21:33:21.000000Z")).toBe(
      "2024-05-12T21:33:21.000Z",
    );
  });

  it("rejects placeholders and garbage", () => {
    expect(parseRecordedDate("1970-01-01T00:00:00.000000Z")).toBeNull();
    expect(parseRecordedDate("1904-01-01T00:00:00.000000Z")).toBeNull();
    expect(parseRecordedDate("not a date")).toBeNull();
    expect(parseRecordedDate(undefined)).toBeNull();
  });
});

describe("parseProbeJson", () => {
  it("parses a landscape H.264 clip with no audio", () => {
    const result = parseProbeJson(loadSample("landscape_h264_noaudio"));
    expect(result).toMatchObject({
      width: 1920,
      height: 1080,
      rotation: 0,
      displayWidth: 1920,
      displayHeight: 1080,
      fps: 30,
      isVfr: false,
      hasAudio: false,
      isHdr: false,
      pixFmt: "yuv420p",
      codec: "h264",
      recordedAt: null,
    });
    expect(result.duration).toBeCloseTo(2, 1);
  });

  it("swaps display size for a rotated clip", () => {
    const result = parseProbeJson(loadSample("rotated_ccw90"));
    expect(result.rotation).toBe(270);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.displayWidth).toBe(1080);
    expect(result.displayHeight).toBe(1920);
  });

  it("flags a variable frame rate clip", () => {
    const result = parseProbeJson(loadSample("portrait_vfr"));
    expect(result.isVfr).toBe(true);
    expect(result.displayWidth).toBe(1080);
    expect(result.displayHeight).toBe(1920);
  });

  // Real iPhone clip (HLG HEVC, Dolby Vision, spatial audio), device and personal tags
  // stripped and dates replaced. Recent iPhones store portrait natively: no display matrix.
  it("parses a real iPhone portrait HLG clip", () => {
    const result = parseProbeJson(loadSample("iphone_hlg_portrait"));
    expect(result).toMatchObject({
      width: 1080,
      height: 1920,
      rotation: 0,
      displayWidth: 1080,
      displayHeight: 1920,
      isVfr: false,
      hasAudio: true,
      colorTransfer: "arib-std-b67",
      isHdr: true,
      pixFmt: "yuv420p10le",
      codec: "hevc",
      recordedAt: "2026-01-15T14:30:00.000Z",
    });
    expect(result.fps).toBeCloseTo(59.98, 1);
    expect(result.duration).toBeCloseTo(6.35, 2);
  });

  it("prefers Apple's creation date over creation_time", () => {
    const result = parseProbeJson({
      streams: [
        {
          codec_type: "video",
          codec_name: "hevc",
          width: 1920,
          height: 1080,
          avg_frame_rate: "30/1",
          r_frame_rate: "30/1",
          tags: { creation_time: "2024-06-01T00:00:00.000000Z" },
        },
      ],
      format: {
        duration: "4.0",
        tags: {
          creation_time: "2024-06-01T00:00:00.000000Z",
          "com.apple.quicktime.creationdate": "2024-05-12T14:33:21-0700",
        },
      },
    });
    expect(result.recordedAt).toBe("2024-05-12T21:33:21.000Z");
  });

  it("throws when there is no video stream", () => {
    expect(() =>
      parseProbeJson({
        streams: [{ codec_type: "audio", codec_name: "aac" }],
        format: { duration: "3.0" },
      }),
    ).toThrow("No usable video stream");
  });
});
