import { describe, expect, it } from "vitest";
import {
  buildCapabilityReport,
  formatCapabilityReport,
  parseEncoderNames,
  parseFilterNames,
  REQUIRED_ENCODERS,
  REQUIRED_FILTERS,
} from "../src/shared/capabilitiesParse";

const FILTERS_SAMPLE = `Filters:
  T.. = Timeline support
  .S. = Slice threading
  ..C = Command support
  A = Audio input/output
  V = Video input/output
  N = Dynamic number and/or type of input/output
  | = Source or sink filter
 ... abuffer           |->A       Buffer audio frames, and make them accessible to the filterchain.
 TS. colorspace        V->V       Convert between colorspaces.
 .S. tonemap           V->V       Conversion to/from different dynamic ranges.
 .SC zscale            V->V       Apply resizing, colorspace and bit depth conversion.
 ... testsrc2          |->V       Generate another test pattern.
`;

const ENCODERS_SAMPLE = `Encoders:
 V..... = Video
 A..... = Audio
 S..... = Subtitle
 .F.... = Frame-level multithreading
 ------
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC (codec h264)
 V....D h264_videotoolbox    VideoToolbox H.264 Encoder (codec h264)
 A....D aac                  AAC (Advanced Audio Coding)
`;

describe("parseFilterNames", () => {
  it("reads filter names and skips the legend", () => {
    const names = parseFilterNames(FILTERS_SAMPLE);
    expect([...names].sort()).toEqual(
      ["abuffer", "colorspace", "testsrc2", "tonemap", "zscale"].sort(),
    );
  });
});

describe("parseEncoderNames", () => {
  it("reads encoder names and skips the legend", () => {
    const names = parseEncoderNames(ENCODERS_SAMPLE);
    expect([...names].sort()).toEqual(
      ["aac", "h264_videotoolbox", "libx264"].sort(),
    );
  });

  it("handles Windows line endings", () => {
    const names = parseEncoderNames(ENCODERS_SAMPLE.replace(/\n/g, "\r\n"));
    expect(names.has("libx264")).toBe(true);
  });
});

describe("buildCapabilityReport", () => {
  it("is ok when every required item is present", () => {
    const report = buildCapabilityReport({
      version: "ffmpeg version 6.0",
      filters: new Set(REQUIRED_FILTERS),
      encoders: new Set(REQUIRED_ENCODERS),
    });
    expect(report.ok).toBe(true);
    expect(report.missingRequired).toEqual([]);
    expect(report.encoders.h264_videotoolbox).toBe(false);
  });

  it("lists missing required filters and encoders", () => {
    const report = buildCapabilityReport({
      version: "ffmpeg version 6.0",
      filters: new Set(REQUIRED_FILTERS.filter((name) => name !== "zscale")),
      encoders: new Set(["aac"]),
    });
    expect(report.ok).toBe(false);
    expect(report.missingRequired).toEqual([
      "filter zscale",
      "encoder libx264",
    ]);
  });

  it("does not fail on missing optional items", () => {
    const report = buildCapabilityReport({
      version: "x",
      filters: new Set(REQUIRED_FILTERS),
      encoders: new Set(REQUIRED_ENCODERS),
    });
    const text = formatCapabilityReport(report);
    expect(text).toContain("h264_videotoolbox");
    expect(text).toContain("(optional)");
    expect(text).toContain("All required capabilities present.");
  });
});
