// Step 0.4 render spike: the throwaway "Spike" composition's shape, shared by main
// (builds the input props, picks the encoder options) and remotion/ (frame counts).
// Pure: no Node or DOM imports. Removed together with the spike (see CHECKLIST 1.4).
import { z } from "zod";
import { mediaUrl } from "./mediaUrl";

export const SPIKE_COMPOSITION_ID = "Spike";
export const SPIKE_FPS = 30;
export const SPIKE_WIDTH = 1080;
export const SPIKE_HEIGHT = 1920;
export const SPIKE_VIDEO_BITRATE = "8M";

export type SpikeSlot = "before" | "after" | "broll";

// Mirrors fixtures/sample.recipe.json: before 3 s, after 4 s, broll 5 s (muted).
// Both audible clips carry a stereo 48 kHz AAC tone from the step 0.3 generator.
export const SPIKE_SEGMENTS: readonly {
  slot: SpikeSlot;
  file: string;
  trimBeforeFrames: number;
  durationInFrames: number;
  muted: boolean;
}[] = [
  {
    slot: "before",
    file: "vertical_1080x1920_30.mp4",
    trimBeforeFrames: 30,
    durationInFrames: 90,
    muted: false,
  },
  {
    slot: "after",
    file: "vertical_b_1080x1920_30.mp4",
    trimBeforeFrames: 15,
    durationInFrames: 120,
    muted: false,
  },
  {
    slot: "broll",
    file: "vertical_1080x1920_30.mp4",
    trimBeforeFrames: 60,
    durationInFrames: 150,
    muted: true,
  },
];

export const SPIKE_DURATION_IN_FRAMES = SPIKE_SEGMENTS.reduce(
  (sum, segment) => sum + segment.durationInFrames,
  0,
);

export type SpikeClipProps = {
  slot: SpikeSlot;
  src: string;
  from: number; // sequence offset, frames
  trimBeforeFrames: number;
  durationInFrames: number;
  muted: boolean;
};

export type SpikeProps = {
  title: string;
  clips: SpikeClipProps[];
};

// baseUrl is the media server base URL, e.g. "http://127.0.0.1:51234/m/<token>".
export function buildSpikeProps(baseUrl: string): SpikeProps {
  let from = 0;
  const clips = SPIKE_SEGMENTS.map((segment): SpikeClipProps => {
    const clip: SpikeClipProps = {
      slot: segment.slot,
      src: mediaUrl(baseUrl, segment.file),
      from,
      trimBeforeFrames: segment.trimBeforeFrames,
      durationInFrames: segment.durationInFrames,
      muted: segment.muted,
    };
    from += segment.durationInFrames;
    return clip;
  });
  return { title: "Sandwich spike", clips };
}

// Default props for the composition registry (Studio, selectComposition metadata).
export const DEFAULT_SPIKE_PROPS: SpikeProps = buildSpikeProps(
  "http://127.0.0.1:0/m/studio",
);

export const SPIKE_MODES = [
  "sw",
  "hw",
  "sw-bitrate",
  "hw-if-possible",
] as const;
export type SpikeMode = (typeof SPIKE_MODES)[number];

export type SpikeHardwareAcceleration = "disable" | "if-possible" | "required";

export const SPIKE_MODE_CONFIG: Record<
  SpikeMode,
  {
    hardwareAcceleration: SpikeHardwareAcceleration;
    videoBitrate: string | null;
  }
> = {
  // Software x264, Remotion's default quality settings (CRF).
  sw: { hardwareAcceleration: "disable", videoBitrate: null },
  // "required" so a silent fallback to libx264 can never pass as a hardware result.
  hw: { hardwareAcceleration: "required", videoBitrate: SPIKE_VIDEO_BITRATE },
  // Same bitrate as hw, for a like-for-like size and speed comparison.
  "sw-bitrate": {
    hardwareAcceleration: "disable",
    videoBitrate: SPIKE_VIDEO_BITRATE,
  },
  // Only run for the record if "hw" threw.
  "hw-if-possible": {
    hardwareAcceleration: "if-possible",
    videoBitrate: SPIKE_VIDEO_BITRATE,
  },
};

export function spikeOutputFileName(mode: SpikeMode): string {
  return `sandwich-spike-${mode}.mp4`;
}

export function spikeResultFileName(mode: SpikeMode): string {
  return `sandwich-spike-${mode}.result.json`;
}

export const spikeRenderRequestSchema = z.object({
  mode: z.enum(SPIKE_MODES),
});
export type SpikeRenderRequest = z.infer<typeof spikeRenderRequestSchema>;

export type SpikeTimings = {
  bundleMs: number | null; // dev only: packaged builds use the prebuilt bundle
  selectMs: number;
  renderMs: number;
  totalMs: number;
};

export type SpikeResult = {
  mode: SpikeMode;
  ok: boolean;
  outputPath: string;
  resultPath: string;
  timings: SpikeTimings | null;
  arch: string;
  cpuCount: number;
  concurrency: number | null;
  hardwareAcceleration: SpikeHardwareAcceleration;
  videoBitrate: string | null;
  encoder: string | null; // as Remotion reports it under verbose logging
  x264Sei: boolean | null; // output contains the "x264 - core" SEI string
  bytes: number | null;
  remotionVersion: string;
  electronVersion: string;
  packaged: boolean;
  error: string | null;
};

export type SpikeProgress = {
  mode: SpikeMode;
  stage: "status" | "bundling" | "browser-download" | "rendering";
  message: string;
  percent: number | null;
};
