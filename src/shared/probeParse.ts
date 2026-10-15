import { z } from "zod";

// Turns `ffprobe -show_format -show_streams -of json` output into a ProbeResult.
// Pure: no Node or DOM imports.

const tagsSchema = z.record(z.string(), z.string()).optional();

const sideDataSchema = z.looseObject({
  side_data_type: z.string().optional(),
  rotation: z.number().optional(),
});

const streamSchema = z.looseObject({
  codec_type: z.string().optional(),
  codec_name: z.string().optional(),
  channels: z.number().optional(),
  sample_rate: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  pix_fmt: z.string().optional(),
  color_transfer: z.string().optional(),
  r_frame_rate: z.string().optional(),
  avg_frame_rate: z.string().optional(),
  duration: z.string().optional(),
  tags: tagsSchema,
  side_data_list: z.array(sideDataSchema).optional(),
});

export const ffprobeOutputSchema = z.looseObject({
  streams: z.array(streamSchema).default([]),
  format: z
    .looseObject({
      duration: z.string().optional(),
      tags: tagsSchema,
    })
    .optional(),
});

export type FfprobeOutput = z.infer<typeof ffprobeOutputSchema>;
type FfprobeStream = FfprobeOutput["streams"][number];

export type Rotation = 0 | 90 | 180 | 270;

export type ProbeResult = {
  duration: number; // seconds, video stream duration (container duration if the stream has none)
  width: number; // coded pixels
  height: number;
  rotation: Rotation; // clockwise degrees needed to display upright
  displayWidth: number; // after rotation
  displayHeight: number;
  fps: number;
  isVfr: boolean;
  hasAudio: boolean;
  audioChannels: number | null; // first audio stream
  audioSampleRate: number | null; // Hz, first audio stream
  colorTransfer: string | null;
  isHdr: boolean;
  pixFmt: string | null;
  recordedAt: string | null; // ISO 8601 UTC
  codec: string;
};

// "30000/1001" -> 29.97. Returns null for "0/0" or anything unparseable.
export function parseFrameRate(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const [numText, denText = "1"] = value.split("/");
  const num = Number(numText);
  const den = Number(denText);
  if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) {
    return null;
  }
  return num / den;
}

// Any angle -> nearest of 0/90/180/270, wrapping negatives (-90 -> 270).
export function normalizeRotation(degrees: number): Rotation {
  const quarter = Math.round(degrees / 90);
  return ((((quarter % 4) + 4) % 4) * 90) as Rotation;
}

// ffprobe reports the display matrix angle counter-clockwise (iPhone portrait: -90).
// The legacy `rotate` tag is clockwise (iPhone portrait: "90"). Both map to 90 here.
export function getRotation(stream: FfprobeStream): Rotation {
  const matrix = stream.side_data_list?.find(
    (entry) =>
      entry.side_data_type === "Display Matrix" &&
      typeof entry.rotation === "number",
  );
  if (matrix?.rotation !== undefined) {
    return normalizeRotation(-matrix.rotation);
  }
  const tag = Number(stream.tags?.rotate);
  return Number.isFinite(tag) ? normalizeRotation(tag) : 0;
}

const HDR_TRANSFERS = new Set(["arib-std-b67", "smpte2084"]);

export function isHdrTransfer(transfer: string | null | undefined): boolean {
  return transfer ? HDR_TRANSFERS.has(transfer) : false;
}

// Frame rates within 1% count as constant; phone clips rarely match exactly.
const VFR_TOLERANCE = 0.01;

export function isVariableFrameRate(
  rFrameRate: number | null,
  avgFrameRate: number | null,
): boolean {
  if (rFrameRate === null || avgFrameRate === null) {
    return false;
  }
  return Math.abs(rFrameRate - avgFrameRate) / rFrameRate > VFR_TOLERANCE;
}

// Accepts ISO strings with "+hhmm" offsets (Apple writes "2024-05-12T14:33:21-0700").
// Returns null for unparseable dates and container epoch placeholders (1904 / 1970).
export function parseRecordedDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const withColon = value.trim().replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const time = Date.parse(withColon);
  if (Number.isNaN(time)) {
    return null;
  }
  const date = new Date(time);
  if (date.getUTCFullYear() <= 1970) {
    return null;
  }
  return date.toISOString();
}

const APPLE_CREATION_DATE = "com.apple.quicktime.creationdate";

// Apple's tag is the capture time; creation_time can be the export/edit time.
function getRecordedAt(
  formatTags: Record<string, string> | undefined,
  video: FfprobeStream,
): string | null {
  const candidates = [
    formatTags?.[APPLE_CREATION_DATE],
    video.tags?.[APPLE_CREATION_DATE],
    formatTags?.creation_time,
    video.tags?.creation_time,
  ];
  for (const candidate of candidates) {
    const parsed = parseRecordedDate(candidate);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

export function parseProbeJson(raw: unknown): ProbeResult {
  const data = ffprobeOutputSchema.parse(raw);
  const video = data.streams.find((stream) => stream.codec_type === "video");
  if (!video || !video.width || !video.height || !video.codec_name) {
    throw new Error("No usable video stream found.");
  }

  // The video stream's own duration: the container's can be slightly longer (AAC priming).
  const duration = Number(video.duration ?? data.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not read the clip duration.");
  }

  const rFrameRate = parseFrameRate(video.r_frame_rate);
  const avgFrameRate = parseFrameRate(video.avg_frame_rate);
  const fps = avgFrameRate ?? rFrameRate;
  if (fps === null) {
    throw new Error("Could not read the clip frame rate.");
  }

  const rotation = getRotation(video);
  const swap = rotation === 90 || rotation === 270;
  const colorTransfer = video.color_transfer ?? null;
  const audio = data.streams.find((stream) => stream.codec_type === "audio");
  const sampleRate = Number(audio?.sample_rate);

  return {
    duration,
    width: video.width,
    height: video.height,
    rotation,
    displayWidth: swap ? video.height : video.width,
    displayHeight: swap ? video.width : video.height,
    fps,
    isVfr: isVariableFrameRate(rFrameRate, avgFrameRate),
    hasAudio: audio !== undefined,
    audioChannels: audio?.channels ?? null,
    audioSampleRate:
      Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : null,
    colorTransfer,
    isHdr: isHdrTransfer(colorTransfer),
    pixFmt: video.pix_fmt ?? null,
    recordedAt: getRecordedAt(data.format?.tags, video),
    codec: video.codec_name,
  };
}
