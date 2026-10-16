import { describe, expect, it } from "vitest";
import { meanRgbStats, parseSsimAll } from "../src/shared/frameStats";

describe("meanRgbStats", () => {
  it("averages channels and computes BT.709 luma", () => {
    const stats = meanRgbStats(new Uint8Array([255, 0, 0, 0, 255, 0]));
    expect(stats.r).toBe(127.5);
    expect(stats.g).toBe(127.5);
    expect(stats.b).toBe(0);
    expect(stats.y).toBeCloseTo(0.2126 * 127.5 + 0.7152 * 127.5, 6);
  });

  it("gives luma 255 for white and 0 for black", () => {
    expect(meanRgbStats(new Uint8Array([255, 255, 255])).y).toBeCloseTo(255, 6);
    expect(meanRgbStats(new Uint8Array([0, 0, 0])).y).toBe(0);
  });

  it("returns zeros for empty input and ignores a trailing partial pixel", () => {
    expect(meanRgbStats(new Uint8Array())).toEqual({ y: 0, r: 0, g: 0, b: 0 });
    expect(meanRgbStats(new Uint8Array([10, 10, 10, 99])).r).toBe(10);
  });
});

describe("parseSsimAll", () => {
  it("reads the All score from ffmpeg's summary line", () => {
    const text =
      "frame=  60 ...\n[Parsed_ssim_5 @ 0x1] SSIM Y:0.912345 (10.5 dB) U:0.95 (13 dB) V:0.94 (12 dB) All:0.923456 (11.2 dB)\n";
    expect(parseSsimAll(text)).toBe(0.923456);
  });

  it("returns null when absent", () => {
    expect(parseSsimAll("nothing here")).toBeNull();
  });
});
