import type { ProbeResult } from "../../src/shared/probeParse";

// A clean 1080x1920 30 fps SDR clip with AAC stereo audio on stream 1. Override per test.
export function makeProbe(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    duration: 8,
    width: 1080,
    height: 1920,
    rotation: 0,
    displayWidth: 1080,
    displayHeight: 1920,
    fps: 30,
    isVfr: false,
    hasAudio: true,
    audioChannels: 2,
    audioSampleRate: 48000,
    audioCodec: "aac",
    audioDuration: 8,
    audioStreamIndex: 1,
    colorTransfer: "bt709",
    colorSpace: "bt709",
    colorPrimaries: "bt709",
    colorRange: "tv",
    isHdr: false,
    pixFmt: "yuv420p",
    recordedAt: null,
    codec: "h264",
    ...overrides,
  };
}
