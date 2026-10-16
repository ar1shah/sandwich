import type { CapabilityReport } from "./capabilitiesParse";
import type { ProbeResult } from "./probeParse";

// Builds the ffmpeg argument array that turns any imported clip into the "working file"
// (docs/reference/ARCHITECTURE.md section 6). Pure: no fs or process access.

export const MAX_LONG_EDGE = 1920;
export const OUTPUT_FPS = 30;
export const AUDIO_SAMPLE_RATE = 48000;

export type ToneMapAlgorithm =
  | "hable"
  | "mobius"
  | "reinhard"
  | "clip"
  | "linear"
  | "gamma";

export type ToneMapParams = {
  npl: number; // nominal peak luminance (nits) the linear signal is scaled against
  algorithm: ToneMapAlgorithm;
  desat: number;
};

// Chosen in step 1.2 by comparing variants against Apple's own SDR conversion of a real
// iPhone HLG clip (DECISIONS #24). The ARCHITECTURE doc values (npl 100) came out about
// 14% too bright; npl 180 matched the reference's brightness and colour best.
export const DEFAULT_TONE_MAP: ToneMapParams = {
  npl: 180,
  algorithm: "hable",
  desat: 0,
};

// Only zscale is supported on purpose: it is a REQUIRED filter in capabilitiesParse.ts,
// so a build without it fails the capability check long before an import. libplacebo
// needs a Vulkan device and the colorspace filter cannot read HLG/PQ, so neither is a
// real fallback (DECISIONS.md).
export type ToneMapPath = "zscale";

export function chooseToneMapPath(
  capabilities: Pick<CapabilityReport, "filters">,
): ToneMapPath {
  if (capabilities.filters.zscale) {
    return "zscale";
  }
  throw new Error(
    "This FFmpeg build has no zscale filter, so HDR clips cannot be tone mapped. " +
      "Run `npm run ffmpeg:fetch` to install the pinned build.",
  );
}

function evenRound(value: number): number {
  return Math.max(2, 2 * Math.round(value / 2));
}

// Fits the display size inside maxLongEdge (never upscales) and rounds to even numbers,
// which yuv420p and libx264 require. 1206x2622 -> 884x1920.
export function targetSize(
  displayWidth: number,
  displayHeight: number,
  maxLongEdge: number = MAX_LONG_EDGE,
): { width: number; height: number } {
  const longEdge = Math.max(displayWidth, displayHeight);
  const factor = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
  return {
    width: evenRound(displayWidth * factor),
    height: evenRound(displayHeight * factor),
  };
}

// HLG and PQ sources: tag-driven input so a file with missing tags still converts.
export function buildToneMapFilter(
  params: ToneMapParams = DEFAULT_TONE_MAP,
  input: {
    transfer?: string | null;
    matrix?: string | null;
    primaries?: string | null;
  } = {},
): string {
  const tin = input.transfer ?? "arib-std-b67";
  const min = input.matrix ?? "bt2020nc";
  const pin = input.primaries ?? "bt2020";
  return [
    `zscale=tin=${tin}:min=${min}:pin=${pin}:rin=tv:t=linear:npl=${params.npl}`,
    "format=gbrpf32le",
    "zscale=p=bt709",
    `tonemap=tonemap=${params.algorithm}:desat=${params.desat}`,
    "zscale=t=bt709:m=bt709:r=tv",
    "format=yuv420p",
  ].join(",");
}

// swscale matrix names. SD-era tags mean BT.601; HD and untagged footage is BT.709.
export function swscaleInputMatrix(colorSpace: string | null): string {
  return colorSpace === "smpte170m" || colorSpace === "bt470bg"
    ? "bt601"
    : "bt709";
}

export function swscaleInputRange(colorRange: string | null): "full" | "tv" {
  return colorRange === "pc" ? "full" : "tv";
}

export type NormalizeArgsOptions = {
  input: string;
  output: string;
  toneMap?: ToneMapParams;
};

export function buildVideoFilter(
  probe: ProbeResult,
  toneMap: ToneMapParams = DEFAULT_TONE_MAP,
): string {
  const { width, height } = targetSize(probe.displayWidth, probe.displayHeight);
  // fps first: a 60 fps source only pays for half the frames in everything after it.
  const head = `fps=${OUTPUT_FPS}`;

  if (probe.isHdr) {
    return [
      head,
      `scale=${width}:${height}:flags=bicubic`,
      buildToneMapFilter(toneMap, {
        transfer: probe.colorTransfer,
        matrix: probe.colorSpace,
        primaries: probe.colorPrimaries,
      }),
      "setsar=1",
    ].join(",");
  }

  const scale =
    `scale=${width}:${height}:flags=bicubic` +
    `:in_range=${swscaleInputRange(probe.colorRange)}` +
    `:in_color_matrix=${swscaleInputMatrix(probe.colorSpace)}` +
    ":out_range=tv:out_color_matrix=bt709";
  return [head, scale, "format=yuv420p", "setsar=1"].join(",");
}

export function buildNormalizeArgs(
  probe: ProbeResult,
  { input, output, toneMap = DEFAULT_TONE_MAP }: NormalizeArgsOptions,
): string[] {
  const hasAudio = probe.audioStreamIndex !== null;
  const duration = probe.duration.toFixed(3);

  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-progress",
    "pipe:1",
    "-nostats",
    "-i",
    input,
    ...(hasAudio
      ? []
      : ["-f", "lavfi", "-i", `anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=stereo`]),
    // Explicit maps only: never default stream selection (iPhone clips carry an
    // undecodable apac audio stream and mebx data tracks).
    "-map",
    "0:v:0",
    "-map",
    hasAudio ? `0:${probe.audioStreamIndex}` : "1:a:0",
    "-map_chapters",
    "-1",
    "-map_metadata",
    "-1",
    "-vf",
    buildVideoFilter(probe, toneMap),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-colorspace",
    "bt709",
    "-color_range",
    "tv",
    "-fps_mode",
    "cfr",
    "-r",
    String(OUTPUT_FPS),
    // Audio always covers the whole video: resync to timestamp 0, pad with silence if
    // short, and let -t cut anything longer.
    ...(hasAudio ? ["-af", "aresample=async=1:first_pts=0,apad"] : []),
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    String(AUDIO_SAMPLE_RATE),
    "-ac",
    "2",
    "-t",
    duration,
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    output,
  ];
}
