import { targetSize } from "./ffmpegArgs";
import type { ProbeResult } from "./probeParse";

// Checks a normalized working file's ProbeResult against the source's. Pure.
// (outputSpec.ts is for finished exports and hardcodes 1080x1920; working files keep
// their aspect ratio, so this one compares against the source instead.)

export type NormalizeCheck = { name: string; ok: boolean; detail: string };

const FRAME = 1 / 30;
const DURATION_TOLERANCE = 0.1; // seconds, output vs source
const SIZE_TOLERANCE = 1; // px, output vs the ideal even-rounded size

export function checkNormalized(
  source: ProbeResult,
  output: ProbeResult,
): NormalizeCheck[] {
  const checks: NormalizeCheck[] = [];
  const add = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
  };

  add("codec", output.codec === "h264", output.codec);
  add("pix_fmt", output.pixFmt === "yuv420p", String(output.pixFmt));
  add(
    "fps",
    output.fps === 30 && !output.isVfr,
    `${output.fps.toFixed(3)}${output.isVfr ? " (VFR)" : ""}`,
  );
  add("color space", output.colorSpace === "bt709", String(output.colorSpace));
  add(
    "color primaries",
    output.colorPrimaries === "bt709",
    String(output.colorPrimaries),
  );
  add(
    "color transfer",
    output.colorTransfer === "bt709",
    String(output.colorTransfer),
  );
  add("color range", output.colorRange === "tv", String(output.colorRange));
  add("not HDR", !output.isHdr, output.isHdr ? "still HDR" : "SDR");

  const longEdge = Math.max(output.width, output.height);
  add("long edge", longEdge <= 1920, String(longEdge));
  add(
    "even size",
    output.width % 2 === 0 && output.height % 2 === 0,
    `${output.width}x${output.height}`,
  );
  add("rotation baked", output.rotation === 0, String(output.rotation));

  const ideal = targetSize(source.displayWidth, source.displayHeight);
  add(
    "size",
    Math.abs(output.width - ideal.width) <= SIZE_TOLERANCE &&
      Math.abs(output.height - ideal.height) <= SIZE_TOLERANCE,
    `${output.width}x${output.height} (ideal ${ideal.width}x${ideal.height})`,
  );

  add(
    "duration",
    Math.abs(output.duration - source.duration) <= DURATION_TOLERANCE,
    `${output.duration.toFixed(3)} s vs source ${source.duration.toFixed(3)} s`,
  );

  add("audio present", output.hasAudio, output.hasAudio ? "yes" : "none");
  add("audio codec", output.audioCodec === "aac", String(output.audioCodec));
  add(
    "audio format",
    output.audioSampleRate === 48000 && output.audioChannels === 2,
    `${output.audioChannels}ch ${output.audioSampleRate} Hz`,
  );
  // Audio must cover the video (concat and mute behave), within one frame.
  const audioGap =
    output.audioDuration === null
      ? null
      : Math.abs(output.audioDuration - output.duration);
  add(
    "audio vs video duration",
    audioGap !== null && audioGap <= FRAME + 1e-6,
    audioGap === null
      ? "no audio duration"
      : `audio ${String(output.audioDuration)} s vs video ${output.duration.toFixed(3)} s`,
  );
  return checks;
}
