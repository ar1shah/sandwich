// npm run verify:render -- <file.mp4> [expectedSeconds] [--recipe <recipe.json>] [--media-root <dir>]
//
// Asserts a rendered file against the output spec (CLAUDE.md "Video output spec"):
// 1080x1920, constant 30 fps, h264 High, yuv420p, Rec.709 tags, AAC 48 kHz stereo, duration
// within 0.1 s, moov before mdat.
//
// With --recipe it also checks, per clip:
//   - audio: muted clips are silent; an unmuted clip is not silent when its source is audible
//   - colour: one frame of a plain clip (no zoom, centred focus, no middle caption) is
//     compared with the same frame of its normalized source, centre patch, +/- 8 of 255.
//     The tags alone are not enough: they only describe how the pixels were converted.
// Exits 1 if any check fails.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { resolveDevFfPaths } from "../src/main/media/binaries";
import { runCapture, runCaptureBuffer } from "../src/main/media/run";
import { meanRgbStats } from "../src/shared/frameStats";
import { isFastStart, topLevelBoxOrder } from "../src/shared/mp4Boxes";
import { checkOutputSpec, parseMaxVolumeDb } from "../src/shared/outputSpec";
import { RecipeSchema, totalDuration, type Recipe } from "../src/shared/recipe";
import {
  COLOUR_MAX_CHANNEL_DIFF,
  COLOUR_PATCH_SIZE,
  compareColourPatches,
  judgeAudioWindow,
  planAudioWindows,
  planColourClip,
} from "../src/shared/verifyRender";

type Row = {
  status: "ok" | "FAIL" | "info" | "skip";
  name: string;
  detail: string;
};

const DURATION_TOLERANCE = 0.1;

// max_volume of [start, start + length] of a file, or null when it cannot be measured
// (no audio stream, or no volumedetect line).
async function maxVolumeDb(
  ffmpeg: string,
  file: string,
  start: number,
  length: number,
): Promise<number | null> {
  try {
    const { stderr } = await runCapture(ffmpeg, [
      "-hide_banner",
      "-nostdin",
      "-ss",
      start.toFixed(3),
      "-t",
      length.toFixed(3),
      "-i",
      file,
      "-vn",
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ]);
    return parseMaxVolumeDb(stderr);
  } catch {
    return null;
  }
}

// Centre patch of one frame, cover-fitted to 1080x1920 the way the composition does it,
// decoded to RGB by ffmpeg using the frame's own colour tags.
async function centrePatch(
  ffmpeg: string,
  file: string,
  time: number,
  fps: number,
): Promise<ReturnType<typeof meanRgbStats>> {
  const { stdout } = await runCaptureBuffer(ffmpeg, [
    "-v",
    "error",
    "-nostdin",
    // Half a frame early, so the frame that starts exactly at `time` is the first one kept.
    "-ss",
    Math.max(0, time - 0.5 / fps).toFixed(4),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,crop=${COLOUR_PATCH_SIZE}:${COLOUR_PATCH_SIZE},format=rgb24`,
    "-f",
    "rawvideo",
    "-",
  ]);
  if (stdout.length !== COLOUR_PATCH_SIZE * COLOUR_PATCH_SIZE * 3) {
    throw new Error(
      `Unexpected frame size (${stdout.length} bytes) from ${file}`,
    );
  }
  return meanRgbStats(stdout);
}

function insideRoot(root: string, relPath: string): string {
  const resolved = path.resolve(root, relPath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Recipe media path escapes the media root: ${relPath}`);
  }
  return resolved;
}

async function recipeChecks(
  ffmpeg: string,
  file: string,
  recipe: Recipe,
  mediaRoot: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  const { fps } = recipe.output;

  for (const [index, window] of planAudioWindows(recipe, fps).entries()) {
    const clip = recipe.clips[index];
    const outputDb = await maxVolumeDb(
      ffmpeg,
      file,
      window.outputStart,
      window.outputLength,
    );
    const sourceDb =
      clip && !window.muted && clip.mediaPath !== ""
        ? await maxVolumeDb(
            ffmpeg,
            insideRoot(mediaRoot, clip.mediaPath),
            window.sourceStart,
            window.sourceLength,
          )
        : null;
    const verdict = judgeAudioWindow(window, outputDb, sourceDb);
    rows.push({
      status:
        verdict.status === "pass"
          ? "ok"
          : verdict.status === "fail"
            ? "FAIL"
            : "info",
      name: `audio ${window.slot} ${window.outputStart.toFixed(1)}-${(window.outputStart + window.outputLength).toFixed(1)} s`,
      detail: verdict.detail,
    });
  }

  const plan = planColourClip(recipe, fps);
  if (!plan) {
    rows.push({
      status: "skip",
      name: "colour fidelity",
      detail:
        "no clip without zoom, off-centre focus or middle caption to compare",
    });
    return rows;
  }
  const source = await centrePatch(
    ffmpeg,
    insideRoot(mediaRoot, plan.sourcePath),
    plan.sourceTime,
    fps,
  );
  const output = await centrePatch(ffmpeg, file, plan.outputTime, fps);
  const verdict = compareColourPatches(source, output);
  const rgb = (s: typeof source): string =>
    `${s.r.toFixed(1)},${s.g.toFixed(1)},${s.b.toFixed(1)}`;
  rows.push({
    status: verdict.ok ? "ok" : "FAIL",
    name: `colour fidelity (${plan.slot})`,
    detail: `source rgb ${rgb(source)} vs render ${rgb(output)}; worst channel diff ${verdict.maxDiff.toFixed(1)} (limit ${COLOUR_MAX_CHANNEL_DIFF})`,
  });
  return rows;
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      recipe: { type: "string" },
      "media-root": { type: "string" },
    },
  });
  const [fileArg, secondsArg] = positionals;
  if (!fileArg || positionals.length > 2) {
    throw new Error(
      "Usage: npm run verify:render -- <file.mp4> [expectedSeconds] [--recipe <recipe.json>] [--media-root <dir>]",
    );
  }
  const file = path.resolve(fileArg);
  const { ffmpeg, ffprobe } = resolveDevFfPaths();

  let recipe: Recipe | null = null;
  let mediaRoot = "";
  if (values.recipe) {
    const recipePath = path.resolve(values.recipe);
    recipe = RecipeSchema.parse(JSON.parse(await readFile(recipePath, "utf8")));
    mediaRoot = path.resolve(values["media-root"] ?? path.dirname(recipePath));
  } else if (values["media-root"]) {
    throw new Error("--media-root only applies together with --recipe.");
  }

  let explicitSeconds: number | null = null;
  if (secondsArg !== undefined) {
    explicitSeconds = Number(secondsArg);
    if (!Number.isFinite(explicitSeconds) || explicitSeconds <= 0) {
      throw new Error(
        `expectedSeconds must be a positive number, got "${secondsArg}".`,
      );
    }
  }

  console.log(`\n${file}`);
  const probe = await runCapture(ffprobe, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    file,
  ]);
  const probeJson: unknown = JSON.parse(probe.stdout);

  const recipeSeconds = recipe ? totalDuration(recipe) : null;
  const notes: string[] = [];
  let expectedSeconds: number;
  if (explicitSeconds !== null) {
    expectedSeconds = explicitSeconds;
    if (
      recipeSeconds !== null &&
      Math.abs(explicitSeconds - recipeSeconds) > DURATION_TOLERANCE
    ) {
      notes.push(
        `warning: expectedSeconds ${explicitSeconds} differs from the recipe's ${recipeSeconds.toFixed(3)} s by more than ${DURATION_TOLERANCE} s; using ${explicitSeconds}`,
      );
    }
  } else if (recipeSeconds !== null) {
    expectedSeconds = recipeSeconds;
  } else {
    const video = (
      probeJson as { streams?: { codec_type?: string; duration?: string }[] }
    ).streams?.find((stream) => stream.codec_type === "video");
    expectedSeconds = Number(video?.duration ?? 0);
    notes.push(
      "note: no expectedSeconds or --recipe given, duration is not checked",
    );
  }

  const rows: Row[] = checkOutputSpec(probeJson, {
    durationSeconds: expectedSeconds,
    fps: 30,
    width: 1080,
    height: 1920,
    hasAudio: true,
    durationToleranceSeconds: DURATION_TOLERANCE,
  }).map((check) => ({
    status: check.ok ? "ok" : "FAIL",
    name: check.name,
    detail: check.detail,
  }));

  const order = topLevelBoxOrder(await readFile(file));
  rows.push({
    status: isFastStart(order) ? "ok" : "FAIL",
    name: "faststart (moov before mdat)",
    detail: order.join(" > "),
  });

  if (recipe) {
    rows.push(...(await recipeChecks(ffmpeg, file, recipe, mediaRoot)));
  }

  for (const row of rows) {
    console.log(
      `  ${row.status.padEnd(4)} ${row.name.padEnd(36)} ${row.detail}`,
    );
  }
  for (const note of notes) {
    console.log(`  ${note}`);
  }

  const failed = rows.filter((row) => row.status === "FAIL");
  console.log(
    failed.length === 0
      ? `\nPASS (${rows.length} checks)`
      : `\nFAIL: ${failed.length} of ${rows.length} checks failed`,
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    `[verify:render] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
