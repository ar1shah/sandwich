// npm run normalize -- <in> <out> [--tonemap-variants [--reference <sdr file>]]
//
// Normalizes one clip into a working file, plus a thumbnail and a filmstrip next to it.
// --tonemap-variants (HDR input) writes several tone map variants and prints mean colour
// and SSIM numbers for each against an SDR reference (the Apple one from avconvert).
import { existsSync } from "node:fs";
import path from "node:path";
import { formatTable } from "./fixtures/specs";
import { resolveDevFfPaths } from "../src/main/media/binaries";
import { makeFilmstrip } from "../src/main/media/filmstrip";
import { normalize } from "../src/main/media/normalize";
import { probeFile } from "../src/main/media/probe";
import { runCapture, runCaptureBuffer } from "../src/main/media/run";
import { makeThumbnail } from "../src/main/media/thumbs";
import { DEFAULT_TONE_MAP, type ToneMapParams } from "../src/shared/ffmpegArgs";
import {
  meanRgbStats,
  parseSsimAll,
  type RgbStats,
} from "../src/shared/frameStats";
import type { ProbeResult } from "../src/shared/probeParse";

const VARIANTS: { name: string; params: ToneMapParams }[] = [
  {
    name: "hable-npl100 (ARCHITECTURE doc values)",
    params: { ...DEFAULT_TONE_MAP, npl: 100 },
  },
  { name: "hable-npl180 (current default)", params: DEFAULT_TONE_MAP },
  { name: "hable-npl203", params: { ...DEFAULT_TONE_MAP, npl: 203 } },
  {
    name: "mobius-npl100",
    params: { ...DEFAULT_TONE_MAP, algorithm: "mobius" },
  },
  {
    name: "reinhard-npl100",
    params: { ...DEFAULT_TONE_MAP, algorithm: "reinhard" },
  },
];

const SAMPLE_FRAMES = 6;

function summary(probe: ProbeResult): string {
  return [
    `${probe.codec} ${probe.pixFmt}`,
    `${probe.displayWidth}x${probe.displayHeight} (coded ${probe.width}x${probe.height}, rot ${probe.rotation})`,
    `${probe.fps.toFixed(2)} fps${probe.isVfr ? " VFR" : ""}`,
    `${probe.duration.toFixed(2)} s`,
    `transfer ${probe.colorTransfer ?? "-"} matrix ${probe.colorSpace ?? "-"} range ${probe.colorRange ?? "-"}`,
    probe.hasAudio
      ? `audio stream ${probe.audioStreamIndex} ${probe.audioCodec} ${probe.audioChannels}ch ${probe.audioSampleRate} Hz`
      : "no audio",
  ].join(" | ");
}

function progressPrinter(label: string): (percent: number) => void {
  let last = -1;
  return (percent) => {
    const whole = Math.floor(percent);
    if (whole !== last && process.stderr.isTTY) {
      last = whole;
      process.stderr.write(`\r[${label}] ${whole}%   `);
    }
  };
}

async function sampledStats(
  file: string,
  probe: ProbeResult,
  size: { width: number; height: number },
): Promise<RgbStats> {
  const { ffmpeg } = resolveDevFfPaths();
  const rate = SAMPLE_FRAMES / probe.duration;
  const { stdout } = await runCaptureBuffer(
    ffmpeg,
    [
      "-v",
      "error",
      "-nostdin",
      "-i",
      file,
      "-vf",
      `fps=${rate.toFixed(4)},scale=${size.width}:${size.height},format=rgb24`,
      "-frames:v",
      String(SAMPLE_FRAMES),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { timeoutMs: 120_000 },
  );
  return meanRgbStats(stdout);
}

async function ssimAgainst(
  file: string,
  reference: string,
  size: { width: number; height: number },
): Promise<number | null> {
  const { ffmpeg } = resolveDevFfPaths();
  const scale = `scale=${size.width}:${size.height}:flags=bicubic,setpts=PTS-STARTPTS`;
  const { stderr } = await runCapture(
    ffmpeg,
    [
      "-hide_banner",
      "-nostdin",
      "-i",
      file,
      "-i",
      reference,
      "-lavfi",
      `[0:v]${scale},fps=30[a];[1:v]${scale},fps=30[b];[a][b]ssim`,
      "-f",
      "null",
      "-",
    ],
    { timeoutMs: 300_000 },
  );
  return parseSsimAll(stderr);
}

// One PNG with the reference and every variant side by side at the same moment, labelled.
async function writeContactSheet(
  panels: { label: string; file: string }[],
  at: number,
  output: string,
): Promise<void> {
  const { ffmpeg } = resolveDevFfPaths();
  const inputs = panels.flatMap((panel) => [
    "-ss",
    at.toFixed(3),
    "-i",
    panel.file,
  ]);
  const chains = panels.map((panel, index) => {
    const text = panel.label.split(" ")[0] ?? "";
    return (
      `[${index}:v]scale=270:480:flags=bicubic,` +
      `drawtext=fontfile=assets/fonts/TikTokSans36pt-Bold.ttf:text='${text}'` +
      ":fontcolor=white:fontsize=18:box=1:boxcolor=black@0.6:x=6:y=h-30" +
      `[p${index}]`
    );
  });
  const stack = `${panels.map((_, i) => `[p${i}]`).join("")}hstack=inputs=${panels.length}`;
  await runCapture(ffmpeg, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    ...inputs,
    "-filter_complex",
    `${chains.join(";")};${stack}`,
    "-frames:v",
    "1",
    output,
  ]);
}

async function runVariants(input: string, outDir: string, reference: string) {
  if (!existsSync(reference)) {
    throw new Error(
      `Reference not found: ${reference}\n` +
        "Make it with: avconvert -s <hdr clip> -o <reference.mov> -p Preset1920x1080",
    );
  }
  const { ffprobe } = resolveDevFfPaths();
  const refProbe = await probeFile(ffprobe, reference);
  const size = {
    width: 360,
    height:
      2 *
      Math.round((360 * refProbe.displayHeight) / refProbe.displayWidth / 2),
  };
  const base = path.basename(input, path.extname(input));

  const rows: string[][] = [];
  const panels: { label: string; file: string }[] = [
    { label: "apple-reference", file: reference },
  ];
  const addRow = async (
    label: string,
    file: string,
    probe: ProbeResult,
    isReference: boolean,
  ) => {
    const stats = await sampledStats(file, probe, size);
    const ssim = isReference ? 1 : await ssimAgainst(file, reference, size);
    rows.push([
      label,
      stats.y.toFixed(1),
      stats.r.toFixed(1),
      stats.g.toFixed(1),
      stats.b.toFixed(1),
      ssim === null ? "n/a" : ssim.toFixed(4),
    ]);
  };

  await addRow(
    `Apple reference (${path.basename(reference)})`,
    reference,
    refProbe,
    true,
  );
  for (const variant of VARIANTS) {
    const slug = variant.name.split(" ")[0] ?? "variant";
    const output = path.join(outDir, `${base}_tm_${slug}.mp4`);
    const label = variant.name;
    const result = await normalize(input, output, {
      toneMap: variant.params,
      onProgress: progressPrinter(label),
    });
    if (process.stderr.isTTY) {
      process.stderr.write("\r");
    }
    await addRow(label, output, result.outputProbe, false);
    panels.push({ label: slug, file: output });
  }
  const sheet = path.join(outDir, `${base}_tm_compare.png`);
  await writeContactSheet(panels, refProbe.duration / 2, sheet);

  console.log(
    `\nTone map variants for ${path.basename(input)} (means of ${SAMPLE_FRAMES} sampled frames at ${size.width}x${size.height}, 0..255):\n`,
  );
  console.log(
    formatTable(
      ["variant", "meanY", "meanR", "meanG", "meanB", "SSIM vs ref"],
      rows,
    ),
  );
  console.log(`\nFiles: ${outDir}/${base}_tm_*.mp4`);
  console.log(
    `Side by side (left to right: ${panels.map((p) => p.label).join(", ")}):\n${sheet}`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const variants = argv.includes("--tonemap-variants");
  const refAt = argv.indexOf("--reference");
  const reference = refAt >= 0 ? argv[refAt + 1] : undefined;
  const positional = argv.filter(
    (arg, at) => !arg.startsWith("--") && (refAt < 0 || at !== refAt + 1),
  );
  const [input, output] = positional;
  if (!input || !output) {
    throw new Error(
      "Usage: npm run normalize -- <in> <out.mp4> [--tonemap-variants [--reference <sdr.mov>]]",
    );
  }

  if (variants) {
    await runVariants(
      path.resolve(input),
      path.dirname(path.resolve(output)),
      path.resolve(
        reference ??
          path.join(
            path.dirname(output),
            `${path.basename(input, path.extname(input))}_apple_sdr.mov`,
          ),
      ),
    );
    return;
  }

  const started = Date.now();
  const result = await normalize(input, output, {
    onProgress: progressPrinter("normalize"),
  });
  if (process.stderr.isTTY) {
    process.stderr.write("\r");
  }
  const seconds = (Date.now() - started) / 1000;

  const stem = path.join(
    path.dirname(path.resolve(output)),
    path.basename(output, path.extname(output)),
  );
  await makeThumbnail(path.resolve(output), `${stem}.jpg`, {
    duration: result.outputProbe.duration,
  });
  const strip = await makeFilmstrip(
    path.resolve(output),
    `${stem}_filmstrip.jpg`,
    {
      duration: result.outputProbe.duration,
      width: result.outputProbe.displayWidth,
      height: result.outputProbe.displayHeight,
    },
  );

  console.log(`before: ${summary(result.probe)}`);
  console.log(`after:  ${summary(result.outputProbe)}`);
  console.log(
    `tone map: ${result.toneMapPath ?? "none (SDR)"}; ${seconds.toFixed(1)} s ` +
      `(${(result.probe.duration / seconds).toFixed(1)}x realtime)`,
  );
  console.log(`thumbnail: ${stem}.jpg`);
  console.log(
    `filmstrip: ${strip.path} (${strip.frameCount} frames of ${strip.frameWidth}x${strip.frameHeight}, every ${strip.interval} s)`,
  );
}

main().catch((error: unknown) => {
  console.error(
    `[normalize] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
