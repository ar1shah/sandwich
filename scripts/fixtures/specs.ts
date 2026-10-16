// Pure helpers for `npm run fixtures`: fixture definitions, ffmpeg argument builders,
// cache hashing, expectations, the sample recipe and the summary table.
// No filesystem or process access here, so all of it is unit tested.
import { createHash } from "node:crypto";
import path from "node:path";
import type { ProbeResult } from "../../src/shared/probeParse";

// Bump when the way fixtures are drawn or encoded changes without the args changing.
export const GENERATOR_VERSION = 1;

// Paths handed to ffmpeg are relative to the project root (ffmpeg is spawned with that cwd),
// so filter strings never contain drive letters or colons. posix joins keep them stable.
export const FIXTURES_DIR = "fixtures";
export const FONT_FILE = "assets/fonts/TikTokSans36pt-Bold.ttf";

export const DURATION_TOLERANCE = 0.05; // seconds
const FPS_TOLERANCE = 0.1;
const RED_BAR_HEIGHT = 24; // px at 1080 wide
const SAFE_LABEL = /^[A-Za-z0-9 _.-]+$/;

export type FixtureSpec = {
  name: string; // file name inside fixtures/
  label: string; // burned in, [A-Za-z0-9 _.-] only
  color: string; // 0xRRGGBB background
  width: number; // upright frame size (the rotated fixture is stored transposed)
  height: number;
  fps: number;
  duration: number; // seconds
  tone: number | null; // Hz, null = no audio
  channels: 1 | 2;
  sampleRate: 44100 | 48000;
  preset: "veryfast" | "ultrafast";
  kind: "video" | "image";
  vfr?: boolean;
  rotated?: boolean;
  hdr?: "hlg" | "pq";
};

function video(
  partial: Partial<FixtureSpec> &
    Pick<FixtureSpec, "name" | "label" | "color" | "tone">,
): FixtureSpec {
  return {
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 6,
    channels: 2,
    sampleRate: 48000,
    preset: "veryfast",
    kind: "video",
    ...partial,
  };
}

export const FIXTURES: readonly FixtureSpec[] = [
  video({
    name: "vertical_1080x1920_30.mp4",
    label: "VERTICAL A",
    color: "0x1F6FEB",
    tone: 440,
    duration: 8,
  }),
  video({
    name: "vertical_b_1080x1920_30.mp4",
    label: "VERTICAL B",
    color: "0xE8590C",
    tone: 554,
    duration: 8,
  }),
  video({
    name: "horizontal_1920x1080_30.mp4",
    label: "HORIZONTAL",
    color: "0x2F9E44",
    tone: 523,
    width: 1920,
    height: 1080,
  }),
  video({
    name: "vertical_60fps.mp4",
    label: "VERTICAL 60FPS",
    color: "0x9C36B5",
    tone: 659,
    fps: 60,
  }),
  video({
    name: "vfr.mp4",
    label: "VFR",
    color: "0x0B7285",
    tone: 622,
    vfr: true,
  }),
  video({
    name: "vertical_4k.mp4",
    label: "VERTICAL 4K",
    color: "0xC2255C",
    tone: 698,
    width: 2160,
    height: 3840,
    duration: 2,
    preset: "ultrafast",
  }),
  video({
    name: "rotated_90.mp4",
    label: "ROTATED",
    color: "0x5F3DC4",
    tone: 784,
    duration: 5,
    rotated: true,
  }),
  video({
    name: "no_audio.mp4",
    label: "NO AUDIO",
    color: "0x495057",
    tone: null,
    duration: 5,
  }),
  video({
    name: "mono_44k.mp4",
    label: "MONO 44K",
    color: "0x66A80F",
    tone: 831,
    duration: 4,
    channels: 1,
    sampleRate: 44100,
  }),
  video({
    name: "short_1s.mp4",
    label: "SHORT 1S",
    color: "0xF08C00",
    tone: 988,
    duration: 1,
  }),
  video({
    name: "still.jpg",
    label: "STILL",
    color: "0x087F5B",
    tone: null,
    duration: 1,
    kind: "image",
  }),
  video({
    name: "hdr_hlg_10bit.mov",
    label: "HDR HLG",
    color: "0x364FC7",
    tone: 1047,
    duration: 4,
    hdr: "hlg",
  }),
  video({
    name: "hdr_pq_10bit.mov",
    label: "HDR PQ",
    color: "0x862E9C",
    tone: 1175,
    duration: 4,
    hdr: "pq",
  }),
];

// ---------------------------------------------------------------------------
// Sync pulse
// ---------------------------------------------------------------------------

// Window shared by the beep and the white flash: first 0.1 s of every second.
// Commas are backslash-escaped for use inside ffmpeg filter option values.
export function pulseExpr(): string {
  return "lt(mod(t\\,1)\\,0.1)";
}

export function audioSourceArg(spec: FixtureSpec): string {
  if (spec.tone === null) {
    throw new Error(`${spec.name} has no audio`);
  }
  const expr = `0.6*sin(2*PI*${spec.tone}*t)*${pulseExpr()}`;
  const layout = spec.channels === 2 ? "stereo" : "mono";
  const exprs = Array.from({ length: spec.channels }, () => expr).join("|");
  return `aevalsrc=exprs='${exprs}':s=${spec.sampleRate}:c=${layout}`;
}

// ---------------------------------------------------------------------------
// ffmpeg arguments
// ---------------------------------------------------------------------------

export function videoFilterChain(spec: FixtureSpec): string {
  if (!SAFE_LABEL.test(spec.label)) {
    throw new Error(`Unsafe label for drawtext: "${spec.label}"`);
  }
  const s = Math.min(spec.width, spec.height) / 1080;
  const px = (n: number): number => Math.round(n * s);
  const detail = `${spec.width}x${spec.height} ${spec.fps}fps ${
    spec.tone === null ? "no audio" : `${spec.tone}Hz`
  }`;
  const text = (
    body: string,
    size: number,
    x: string,
    y: string,
  ): string =>
    `drawtext=fontfile=${FONT_FILE}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=${px(14)}` +
    `:text='${body}':fontsize=${px(size)}:x=${x}:y=${y}`;

  const bar = px(RED_BAR_HEIGHT);
  const filters = [
    // Work in RGB so the colours are exact, convert to YUV once at the end.
    "format=rgb24",
    `drawbox=x=0:y=0:w=iw:h=${bar}:color=0xFF0000:t=fill`,
    text("TOP", 64, String(px(40)), String(px(48))),
    text(spec.label, 110, "(w-text_w)/2", "h*0.30"),
    text("%{pts\\:hms}  f%{n}", 80, "(w-text_w)/2", "h*0.44"),
    text(detail, 56, "(w-text_w)/2", "h*0.55"),
    text("#####", 80, "mod(t*400\\,w-text_w)", "h*0.75"),
    // Flash stays below the red bar so the bar is visible in every frame.
    `drawbox=x=0:y=${bar}:w=iw:h=ih-${bar}:color=white:t=fill:enable='${pulseExpr()}'`,
  ];
  if (spec.vfr) {
    // Drop every 7th frame, keeping original timestamps (gaps) for a real VFR file.
    filters.push("select='not(eq(mod(n\\,7)\\,3))'");
  }
  if (spec.rotated) {
    // 90 degrees clockwise: upright content is stored as landscape pixels.
    filters.push("transpose=1");
  }
  if (spec.kind === "image") {
    filters.push("format=yuvj420p");
  } else if (spec.hdr) {
    filters.push(
      "scale=out_color_matrix=bt2020:out_range=tv",
      "format=yuv420p10le",
    );
  } else {
    filters.push(
      "scale=out_color_matrix=bt709:out_range=tv",
      "format=yuv420p",
    );
  }
  return filters.join(",");
}

function videoEncodeArgs(spec: FixtureSpec): string[] {
  if (spec.hdr) {
    const trc = spec.hdr === "hlg" ? "arib-std-b67" : "smpte2084";
    return [
      "-c:v",
      "libx265",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p10le",
      "-tag:v",
      "hvc1",
      "-x265-params",
      `log-level=error:colorprim=bt2020:transfer=${trc}:colormatrix=bt2020nc:range=limited`,
      "-color_primaries",
      "bt2020",
      "-color_trc",
      trc,
      "-colorspace",
      "bt2020nc",
      "-color_range",
      "tv",
    ];
  }
  return [
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-preset",
    spec.preset,
    "-crf",
    "23",
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
  ];
}

const BASE_ARGS = ["-y", "-hide_banner", "-loglevel", "error", "-nostdin"];

export type FixtureCommands = {
  steps: string[][]; // ffmpeg argument arrays, run in order with cwd = project root
  output: string; // temp file the last step writes (renamed on success)
  intermediates: string[]; // temp files to delete afterwards
};

export function tempName(name: string, suffix = ""): string {
  const ext = path.posix.extname(name);
  return `${name.slice(0, -ext.length)}${suffix}.tmp${ext}`;
}

export function buildFixtureCommands(
  spec: FixtureSpec,
  outDir: string = FIXTURES_DIR,
): FixtureCommands {
  const output = path.posix.join(outDir, tempName(spec.name));
  const colorSource = `color=c=${spec.color}:s=${spec.width}x${spec.height}:r=${spec.fps}`;
  const duration = String(spec.duration);

  if (spec.kind === "image") {
    return {
      steps: [
        [
          ...BASE_ARGS,
          "-f",
          "lavfi",
          "-t",
          duration,
          "-i",
          colorSource,
          "-vf",
          videoFilterChain(spec),
          "-frames:v",
          "1",
          "-update",
          "1",
          "-q:v",
          "2",
          output,
        ],
      ],
      output,
      intermediates: [],
    };
  }

  const hasAudio = spec.tone !== null;
  // The rotated fixture is encoded upright-transposed first, then remuxed so only the
  // display matrix changes (-display_rotation is an input option).
  const encodeOutput = spec.rotated
    ? path.posix.join(outDir, tempName(spec.name, ".pre"))
    : output;

  const encode = [
    ...BASE_ARGS,
    "-f",
    "lavfi",
    "-t",
    duration,
    "-i",
    colorSource,
    ...(hasAudio
      ? ["-f", "lavfi", "-t", duration, "-i", audioSourceArg(spec)]
      : []),
    "-vf",
    videoFilterChain(spec),
    "-map",
    "0:v:0",
    ...(hasAudio ? ["-map", "1:a:0"] : []),
    ...videoEncodeArgs(spec),
    "-fps_mode",
    spec.vfr ? "vfr" : "cfr",
    ...(hasAudio
      ? [
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-ar",
          String(spec.sampleRate),
          "-ac",
          String(spec.channels),
        ]
      : ["-an"]),
    "-movflags",
    "+faststart",
    encodeOutput,
  ];

  if (!spec.rotated) {
    return { steps: [encode], output, intermediates: [] };
  }

  // Matches tests/fixtures/probe/rotated_ccw90.json: coded 1920x1080, ffprobe rotation 90
  // (counter-clockwise), which our parser reports as rotation 270.
  const remux = [
    ...BASE_ARGS,
    "-display_rotation",
    "90",
    "-i",
    encodeOutput,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    output,
  ];
  return { steps: [encode, remux], output, intermediates: [encodeOutput] };
}

// ---------------------------------------------------------------------------
// Cache hash
// ---------------------------------------------------------------------------

export type HashInput = {
  steps: string[][];
  ffmpegVersion: string; // first line of `ffmpeg -version`
  fontSha256: string;
  generatorVersion?: number;
};

export function hashFixture(input: HashInput): string {
  const normalized = JSON.stringify({
    steps: input.steps,
    ffmpegVersion: input.ffmpegVersion,
    fontSha256: input.fontSha256,
    generatorVersion: input.generatorVersion ?? GENERATOR_VERSION,
  });
  return createHash("sha256").update(normalized).digest("hex");
}

// ---------------------------------------------------------------------------
// Expectations (the table doubles as the check)
// ---------------------------------------------------------------------------

export function checkProbe(spec: FixtureSpec, probe: ProbeResult): string[] {
  const problems: string[] = [];
  const expect = (ok: boolean, message: string): void => {
    if (!ok) {
      problems.push(message);
    }
  };

  const codedW = spec.rotated ? spec.height : spec.width;
  const codedH = spec.rotated ? spec.width : spec.height;
  expect(
    probe.width === codedW && probe.height === codedH,
    `coded size ${probe.width}x${probe.height}, expected ${codedW}x${codedH}`,
  );

  if (spec.kind === "image") {
    return problems;
  }

  expect(
    Math.abs(probe.duration - spec.duration) <= DURATION_TOLERANCE,
    `duration ${probe.duration.toFixed(3)} s, expected ${spec.duration} s`,
  );
  expect(
    probe.displayWidth === spec.width && probe.displayHeight === spec.height,
    `display size ${probe.displayWidth}x${probe.displayHeight}, expected ${spec.width}x${spec.height}`,
  );
  const expectedRotation = spec.rotated ? 270 : 0;
  expect(
    probe.rotation === expectedRotation,
    `rotation ${probe.rotation}, expected ${expectedRotation}`,
  );
  expect(
    probe.isVfr === Boolean(spec.vfr),
    `isVfr ${probe.isVfr}, expected ${Boolean(spec.vfr)}`,
  );
  if (!spec.vfr) {
    expect(
      Math.abs(probe.fps - spec.fps) <= FPS_TOLERANCE,
      `fps ${probe.fps.toFixed(2)}, expected ${spec.fps}`,
    );
  }

  if (spec.tone === null) {
    expect(!probe.hasAudio, "has an audio stream, expected none");
  } else {
    expect(probe.hasAudio, "no audio stream");
    expect(
      probe.audioChannels === spec.channels,
      `audio channels ${probe.audioChannels}, expected ${spec.channels}`,
    );
    expect(
      probe.audioSampleRate === spec.sampleRate,
      `audio rate ${probe.audioSampleRate}, expected ${spec.sampleRate}`,
    );
  }

  if (spec.hdr) {
    const trc = spec.hdr === "hlg" ? "arib-std-b67" : "smpte2084";
    expect(probe.isHdr, "not flagged HDR");
    expect(
      probe.colorTransfer === trc,
      `transfer ${probe.colorTransfer}, expected ${trc}`,
    );
    expect(
      probe.pixFmt === "yuv420p10le",
      `pix_fmt ${probe.pixFmt}, expected yuv420p10le`,
    );
    expect(probe.codec === "hevc", `codec ${probe.codec}, expected hevc`);
  } else {
    expect(!probe.isHdr, "flagged HDR, expected SDR");
    expect(probe.pixFmt === "yuv420p", `pix_fmt ${probe.pixFmt}`);
    expect(probe.codec === "h264", `codec ${probe.codec}, expected h264`);
  }
  return problems;
}

// Share of pixels that are clearly red in packed rgb24 bytes.
export function redFraction(rgb24: Uint8Array): number {
  const pixels = Math.floor(rgb24.length / 3);
  if (pixels === 0) {
    return 0;
  }
  let red = 0;
  for (let i = 0; i < pixels; i += 1) {
    const r = rgb24[i * 3] ?? 0;
    const g = rgb24[i * 3 + 1] ?? 0;
    const b = rgb24[i * 3 + 2] ?? 0;
    if (r > 200 && g < 60 && b < 60) {
      red += 1;
    }
  }
  return red / pixels;
}

// ---------------------------------------------------------------------------
// sample.recipe.json
// ---------------------------------------------------------------------------

// Local shape that mirrors SPEC section 3. tests/recipe.test.ts parses buildSampleRecipe() with
// RecipeSchema (src/shared/recipe.ts), so any drift from the real schema fails a test.
export type SampleClip = {
  slot: "before" | "after" | "broll";
  mediaPath: string;
  sourceDuration: number;
  trimStart: number;
  duration: number;
  zoom: "none" | "slow-push" | "punch-in";
  focus: { x: number; y: number };
  muted: boolean;
  caption: {
    text: string;
    style: "outline" | "box";
    position: "top" | "middle";
  } | null;
};

export type SampleRecipe = {
  schemaVersion: 1;
  id: string;
  productId: string;
  productSlug: string;
  clips: [SampleClip, SampleClip, SampleClip];
  output: { width: 1080; height: 1920; fps: 30 };
  createdAt: string;
  updatedAt: string;
};

export const TRIM_MARGIN = 0.5; // seconds kept free at the end of every source

export function buildSampleRecipe(sourceDurations: {
  before: number;
  after: number;
  broll: number;
}): SampleRecipe {
  const clip = (
    c: Omit<SampleClip, "focus" | "mediaPath"> & {
      file: string;
      focus?: SampleClip["focus"];
    },
  ): SampleClip => {
    if (c.trimStart + c.duration > c.sourceDuration - TRIM_MARGIN) {
      throw new Error(
        `${c.slot}: trim ${c.trimStart}+${c.duration} s leaves under ${TRIM_MARGIN} s of ${c.sourceDuration} s source`,
      );
    }
    return {
      slot: c.slot,
      mediaPath: c.file,
      sourceDuration: c.sourceDuration,
      trimStart: c.trimStart,
      duration: c.duration,
      zoom: c.zoom,
      focus: c.focus ?? { x: 0.5, y: 0.5 },
      muted: c.muted,
      caption: c.caption,
    };
  };

  return {
    schemaVersion: 1,
    id: "00000000-0000-4000-8000-000000000001",
    productId: "00000000-0000-4000-8000-000000000002",
    productSlug: "fixture-product",
    clips: [
      clip({
        slot: "before",
        file: "vertical_1080x1920_30.mp4",
        sourceDuration: sourceDurations.before,
        trimStart: 1,
        duration: 3,
        zoom: "slow-push",
        muted: false,
        caption: {
          text: "My skin before",
          style: "outline",
          position: "top",
        },
      }),
      clip({
        slot: "after",
        file: "vertical_b_1080x1920_30.mp4",
        sourceDuration: sourceDurations.after,
        trimStart: 0.5,
        duration: 4,
        // Off-center punch-in so the composition's focus and punch-in paths are exercised.
        zoom: "punch-in",
        focus: { x: 0.3, y: 0.35 },
        muted: false,
        caption: {
          text: "Two weeks later\nlook at the difference",
          style: "box",
          position: "middle",
        },
      }),
      clip({
        slot: "broll",
        file: "vertical_1080x1920_30.mp4",
        sourceDuration: sourceDurations.broll,
        trimStart: 2,
        duration: 5,
        zoom: "none",
        muted: true,
        caption: {
          text: "Tap the yellow basket to grab it before it sells out again this weekend",
          style: "outline",
          position: "middle",
        },
      }),
    ],
    output: { width: 1080, height: 1920, fps: 30 },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const line = (cells: readonly string[]): string =>
    cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ");
  return [
    line(headers),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...rows.map(line),
  ].join("\n");
}

export function describeProbe(probe: ProbeResult): string[] {
  const transfer = probe.colorTransfer ?? "sdr";
  return [
    `${probe.duration.toFixed(2)} s`,
    `${probe.width}x${probe.height}`,
    String(probe.rotation),
    `${probe.displayWidth}x${probe.displayHeight}`,
    probe.fps.toFixed(2),
    probe.isVfr ? "yes" : "no",
    probe.hasAudio
      ? `${probe.audioChannels ?? "?"}ch ${probe.audioSampleRate ?? "?"}Hz`
      : "none",
    `${probe.pixFmt ?? "?"} ${transfer}`,
    probe.isHdr ? "yes" : "no",
  ];
}
