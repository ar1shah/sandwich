import { describe, expect, it } from "vitest";
import { checkOutputSpec, parseMaxVolumeDb } from "../src/shared/outputSpec";

const goodVideo = {
  codec_type: "video",
  codec_name: "h264",
  profile: "High",
  width: 1080,
  height: 1920,
  pix_fmt: "yuv420p",
  color_space: "bt709",
  color_transfer: "bt709",
  color_primaries: "bt709",
  color_range: "tv",
  r_frame_rate: "30/1",
  avg_frame_rate: "30/1",
  duration: "12.000000",
};
const goodAudio = {
  codec_type: "audio",
  codec_name: "aac",
  sample_rate: "48000",
  channels: 2,
  duration: "12.010667",
};

const failures = (json: unknown) =>
  checkOutputSpec(json)
    .filter((check) => !check.ok)
    .map((check) => check.name);

describe("checkOutputSpec", () => {
  it("passes a compliant file", () => {
    expect(failures({ streams: [goodVideo, goodAudio] })).toEqual([]);
  });

  it("allows 0.1 s of video duration drift but not more", () => {
    const at = (seconds: string) =>
      failures({
        streams: [
          { ...goodVideo, duration: seconds },
          { ...goodAudio, duration: seconds },
        ],
      });
    expect(at("12.080")).toEqual([]);
    expect(at("11.920")).toEqual([]);
    expect(at("12.150")).toEqual(["video duration"]);
  });

  it("flags colour tags that are not SDR Rec.709 limited range", () => {
    const tagged = (extra: Record<string, string>) =>
      failures({ streams: [{ ...goodVideo, ...extra }, goodAudio] });
    expect(tagged({ color_space: "unknown" })).toEqual(["color_space"]);
    expect(tagged({ color_transfer: "iec61966-2-1" })).toEqual([
      "color_transfer",
    ]);
    expect(tagged({ color_primaries: "bt2020" })).toEqual(["color_primaries"]);
    expect(tagged({ color_range: "pc" })).toEqual(["color_range"]);
    const untagged: Record<string, unknown> = { ...goodVideo };
    delete untagged.color_space;
    expect(failures({ streams: [untagged, goodAudio] })).toEqual([
      "color_space",
    ]);
  });

  it("flags audio that drifts more than a frame from the video", () => {
    expect(
      failures({
        streams: [goodVideo, { ...goodAudio, duration: "12.2" }],
      }),
    ).toEqual(["audio duration"]);
  });

  it("flags variable frame rate, wrong profile and wrong audio layout", () => {
    const bad = {
      streams: [
        {
          ...goodVideo,
          avg_frame_rate: "2997/100",
          profile: "Main",
          pix_fmt: "yuv444p",
        },
        { ...goodAudio, sample_rate: "44100", channels: 1 },
      ],
    };
    expect(failures(bad)).toEqual(
      expect.arrayContaining([
        "avg_frame_rate",
        "codec",
        "pix_fmt",
        "audio rate",
        "audio channels",
      ]),
    );
  });

  it("hard fails a missing or non-AAC/48k/stereo audio stream", () => {
    expect(failures({ streams: [goodVideo] })).toEqual(["audio stream"]);
    expect(
      failures({
        streams: [goodVideo, { ...goodAudio, codec_name: "mp3" }],
      }),
    ).toEqual(["audio codec"]);
    expect(
      failures({
        streams: [goodVideo, { ...goodAudio, sample_rate: "44100" }],
      }),
    ).toEqual(["audio rate"]);
    expect(
      failures({ streams: [goodVideo, { ...goodAudio, channels: 1 }] }),
    ).toEqual(["audio channels"]);
  });

  it("fails when streams are missing", () => {
    expect(failures({ streams: [] })).toEqual(["video stream"]);
    expect(failures({ streams: [goodVideo] })).toEqual(["audio stream"]);
  });
});

describe("parseMaxVolumeDb", () => {
  it("reads max_volume from ffmpeg stderr", () => {
    expect(
      parseMaxVolumeDb("[Parsed_volumedetect_0] max_volume: -4.5 dB\n"),
    ).toBe(-4.5);
  });

  it("treats -inf as silence and missing output as null", () => {
    expect(parseMaxVolumeDb("max_volume: -inf dB")).toBe(
      Number.NEGATIVE_INFINITY,
    );
    expect(parseMaxVolumeDb("nothing here")).toBeNull();
  });
});
