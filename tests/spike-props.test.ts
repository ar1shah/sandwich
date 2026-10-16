import { describe, expect, it } from "vitest";
import {
  buildSpikeProps,
  SPIKE_DURATION_IN_FRAMES,
  SPIKE_FPS,
  SPIKE_MODE_CONFIG,
  SPIKE_MODES,
  SPIKE_SEGMENTS,
  spikeOutputFileName,
  spikeRenderRequestSchema,
  spikeResultFileName,
} from "../src/shared/spikeProps";

describe("buildSpikeProps", () => {
  const props = buildSpikeProps("http://127.0.0.1:5555/m/tok/");

  it("is 12 seconds / 360 frames at 30 fps", () => {
    expect(SPIKE_FPS).toBe(30);
    expect(SPIKE_DURATION_IN_FRAMES).toBe(360);
    expect(SPIKE_DURATION_IN_FRAMES / SPIKE_FPS).toBe(12);
  });

  it("lays out before, after, broll with 3 / 4 / 5 second lengths", () => {
    expect(props.clips.map((clip) => clip.slot)).toEqual([
      "before",
      "after",
      "broll",
    ]);
    expect(
      props.clips.map((clip) => clip.durationInFrames / SPIKE_FPS),
    ).toEqual([3, 4, 5]);
  });

  it("starts sequences at frames 0 / 90 / 210", () => {
    expect(props.clips.map((clip) => clip.from)).toEqual([0, 90, 210]);
  });

  it("trims 1.0 / 0.5 / 2.0 seconds into the sources", () => {
    expect(props.clips.map((clip) => clip.trimBeforeFrames)).toEqual([
      30, 15, 60,
    ]);
  });

  it("mutes only the b-roll", () => {
    expect(props.clips.map((clip) => clip.muted)).toEqual([false, false, true]);
  });

  it("joins media URLs without double slashes and encodes names", () => {
    expect(props.clips[0]?.src).toBe(
      "http://127.0.0.1:5555/m/tok/vertical_1080x1920_30.mp4",
    );
    expect(buildSpikeProps("http://h:1").clips[1]?.src).toBe(
      "http://h:1/vertical_b_1080x1920_30.mp4",
    );
  });

  it("keeps every trim inside the 8 s fixtures with a 0.5 s margin", () => {
    for (const segment of SPIKE_SEGMENTS) {
      const end = segment.trimBeforeFrames + segment.durationInFrames;
      expect(end / SPIKE_FPS).toBeLessThanOrEqual(8 - 0.5);
    }
  });
});

describe("spike modes", () => {
  it("requires hardware acceleration for hw so fallback cannot pass as hw", () => {
    expect(SPIKE_MODE_CONFIG.hw.hardwareAcceleration).toBe("required");
    expect(SPIKE_MODE_CONFIG.sw.hardwareAcceleration).toBe("disable");
    expect(SPIKE_MODE_CONFIG["sw-bitrate"].hardwareAcceleration).toBe(
      "disable",
    );
    expect(SPIKE_MODE_CONFIG["hw-if-possible"].hardwareAcceleration).toBe(
      "if-possible",
    );
  });

  it("gives hw and sw-bitrate the same bitrate and sw none", () => {
    expect(SPIKE_MODE_CONFIG.hw.videoBitrate).toBe("8M");
    expect(SPIKE_MODE_CONFIG["sw-bitrate"].videoBitrate).toBe("8M");
    expect(SPIKE_MODE_CONFIG.sw.videoBitrate).toBeNull();
  });

  it("names outputs and results per mode so nothing is overwritten", () => {
    const names = SPIKE_MODES.map(spikeOutputFileName);
    expect(new Set(names).size).toBe(SPIKE_MODES.length);
    expect(spikeOutputFileName("hw")).toBe("sandwich-spike-hw.mp4");
    expect(spikeResultFileName("sw-bitrate")).toBe(
      "sandwich-spike-sw-bitrate.result.json",
    );
  });

  it("validates the IPC payload", () => {
    expect(spikeRenderRequestSchema.parse({ mode: "hw" })).toEqual({
      mode: "hw",
    });
    expect(() => spikeRenderRequestSchema.parse({ mode: "turbo" })).toThrow();
    expect(() => spikeRenderRequestSchema.parse({})).toThrow();
    expect(() => spikeRenderRequestSchema.parse("sw")).toThrow();
  });
});
