import { describe, expect, it } from "vitest";
import { checkOutputSpec, parseMaxVolumeDb } from "../src/shared/outputSpec";

const goodVideo = {
  codec_type: "video",
  codec_name: "h264",
  profile: "High",
  width: 1080,
  height: 1920,
  pix_fmt: "yuv420p",
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

  it("allows one frame of duration drift but not two", () => {
    expect(
      failures({ streams: [{ ...goodVideo, duration: "12.033" }, goodAudio] }),
    ).toEqual([]);
    expect(
      failures({ streams: [{ ...goodVideo, duration: "12.080" }, goodAudio] }),
    ).toContain("video duration");
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
