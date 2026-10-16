import { z } from "zod";

// Checks an ffprobe JSON result against the output spec in CLAUDE.md ("Video output spec").
// Pure: no fs or process. Step 1.5's verify:render builds on this; step 0.4 uses it for
// the spike renders.

const streamSchema = z.looseObject({
  codec_type: z.string().optional(),
  codec_name: z.string().optional(),
  profile: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  pix_fmt: z.string().optional(),
  r_frame_rate: z.string().optional(),
  avg_frame_rate: z.string().optional(),
  duration: z.string().optional(),
  sample_rate: z.string().optional(),
  channels: z.number().optional(),
});

const probeSchema = z.looseObject({
  streams: z.array(streamSchema).default([]),
});

export type SpecCheck = { name: string; ok: boolean; detail: string };

export type OutputSpecExpectations = {
  durationSeconds: number;
  fps: number; // 30
  width: number; // 1080
  height: number; // 1920
  hasAudio: boolean;
};

export const DEFAULT_OUTPUT_SPEC: OutputSpecExpectations = {
  durationSeconds: 12,
  fps: 30,
  width: 1080,
  height: 1920,
  hasAudio: true,
};

export function checkOutputSpec(
  ffprobeJson: unknown,
  expected: OutputSpecExpectations = DEFAULT_OUTPUT_SPEC,
): SpecCheck[] {
  const { streams } = probeSchema.parse(ffprobeJson);
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const checks: SpecCheck[] = [];
  const add = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
  };
  const oneFrame = 1 / expected.fps;
  const rate = `${expected.fps}/1`;

  if (!video) {
    add("video stream", false, "no video stream");
    return checks;
  }

  add(
    "size",
    video.width === expected.width && video.height === expected.height,
    `${video.width}x${video.height}`,
  );
  add("r_frame_rate", video.r_frame_rate === rate, String(video.r_frame_rate));
  add(
    "avg_frame_rate",
    video.avg_frame_rate === rate,
    String(video.avg_frame_rate),
  );
  add(
    "codec",
    video.codec_name === "h264" && video.profile === "High",
    `${video.codec_name} ${video.profile}`,
  );
  add("pix_fmt", video.pix_fmt === "yuv420p", String(video.pix_fmt));

  const videoDuration = Number(video.duration);
  add(
    "video duration",
    Number.isFinite(videoDuration) &&
      Math.abs(videoDuration - expected.durationSeconds) <= oneFrame + 1e-6,
    `${video.duration} s (expected ${expected.durationSeconds} +/- ${oneFrame.toFixed(3)})`,
  );

  if (!expected.hasAudio) {
    add("audio", audio === undefined, audio ? "has audio" : "none");
    return checks;
  }

  if (!audio) {
    add("audio stream", false, "no audio stream");
    return checks;
  }
  add("audio codec", audio.codec_name === "aac", String(audio.codec_name));
  add("audio rate", audio.sample_rate === "48000", String(audio.sample_rate));
  add("audio channels", audio.channels === 2, String(audio.channels));

  const audioDuration = Number(audio.duration);
  add(
    "audio duration",
    Number.isFinite(audioDuration) &&
      Number.isFinite(videoDuration) &&
      Math.abs(audioDuration - videoDuration) <= oneFrame + 1e-6,
    `${audio.duration} s vs video ${video.duration} s`,
  );
  return checks;
}

// "volumedetect" prints "max_volume: -4.2 dB"; silence prints -91.0 dB or "-inf".
export function parseMaxVolumeDb(ffmpegStderr: string): number | null {
  const match = /max_volume:\s*(-?inf|-?\d+(?:\.\d+)?)\s*dB/.exec(ffmpegStderr);
  if (!match?.[1]) {
    return null;
  }
  return match[1].includes("inf") ? Number.NEGATIVE_INFINITY : Number(match[1]);
}
