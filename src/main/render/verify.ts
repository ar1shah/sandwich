// Checks a rendered file against the output spec (CLAUDE.md "Video output spec"). Shared by
// the export job (main) and `npm run verify:render` (scripts/verify-render.ts).
//
// Every row has a severity (DECISIONS #38):
//   hard: the output spec (size, fps, codec/profile, pixel format, colour tags, audio, duration)
//         and faststart. A failing hard row means the file must not be exported.
//   soft: per-clip audio and colour fidelity. These are heuristics (one 64 px patch on one
//         frame, volume thresholds) that can false-fail on real handheld clips, so the export
//         still succeeds and the failure is shown as a warning.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { meanRgbStats } from "../../shared/frameStats";
import { isFastStart, topLevelBoxOrder } from "../../shared/mp4Boxes";
import { checkOutputSpec, parseMaxVolumeDb } from "../../shared/outputSpec";
import { totalDuration, type Recipe } from "../../shared/recipe";
import {
  COLOUR_MAX_CHANNEL_DIFF,
  COLOUR_PATCH_SIZE,
  compareColourPatches,
  judgeAudioWindow,
  planAudioWindows,
  planColourClip,
} from "../../shared/verifyRender";
import type { FfPaths } from "../media/binaries";
import { isAbortError, runCapture, runCaptureBuffer } from "../media/run";

export type VerifySeverity = "hard" | "soft";

export type VerifyRow = {
  status: "ok" | "FAIL" | "info" | "skip";
  severity: VerifySeverity;
  name: string;
  detail: string;
};

export type VerifyResult = {
  rows: VerifyRow[];
  // Lines like "colour fidelity (before): ..." for the notes the script prints.
  notes: string[];
  expectedSeconds: number;
  // True when no hard row failed (soft failures do not count).
  ok: boolean;
  hardFailures: VerifyRow[];
  warnings: VerifyRow[];
};

export type VerifyOptions = {
  file: string;
  ffPaths: FfPaths;
  recipe?: Recipe | null;
  // Where the recipe's relative media paths live. Required with a recipe.
  mediaRoot?: string;
  expectedSeconds?: number | null;
  // The app turns a failure of the soft checks themselves (unreadable source, ffmpeg error)
  // into a warning row; the script lets it throw, as it always did.
  catchSoftErrors?: boolean;
  signal?: AbortSignal;
};

export const DURATION_TOLERANCE = 0.1;

// max_volume of [start, start + length] of a file, or null when it cannot be measured
// (no audio stream, or no volumedetect line).
async function maxVolumeDb(
  ffmpeg: string,
  file: string,
  start: number,
  length: number,
  signal: AbortSignal | undefined,
): Promise<number | null> {
  try {
    const { stderr } = await runCapture(
      ffmpeg,
      [
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
      ],
      signal ? { signal } : {},
    );
    return parseMaxVolumeDb(stderr);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
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
  signal: AbortSignal | undefined,
): Promise<ReturnType<typeof meanRgbStats>> {
  const { stdout } = await runCaptureBuffer(
    ffmpeg,
    [
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
    ],
    signal ? { signal } : {},
  );
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
  signal: AbortSignal | undefined,
): Promise<VerifyRow[]> {
  const rows: VerifyRow[] = [];
  const { fps } = recipe.output;

  for (const [index, window] of planAudioWindows(recipe, fps).entries()) {
    const clip = recipe.clips[index];
    const outputDb = await maxVolumeDb(
      ffmpeg,
      file,
      window.outputStart,
      window.outputLength,
      signal,
    );
    const sourceDb =
      clip && !window.muted && clip.mediaPath !== ""
        ? await maxVolumeDb(
            ffmpeg,
            insideRoot(mediaRoot, clip.mediaPath),
            window.sourceStart,
            window.sourceLength,
            signal,
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
      severity: "soft",
      name: `audio ${window.slot} ${window.outputStart.toFixed(1)}-${(window.outputStart + window.outputLength).toFixed(1)} s`,
      detail: verdict.detail,
    });
  }

  const plan = planColourClip(recipe, fps);
  if (!plan) {
    rows.push({
      status: "skip",
      severity: "soft",
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
    signal,
  );
  const output = await centrePatch(ffmpeg, file, plan.outputTime, fps, signal);
  const verdict = compareColourPatches(source, output);
  const rgb = (s: typeof source): string =>
    `${s.r.toFixed(1)},${s.g.toFixed(1)},${s.b.toFixed(1)}`;
  rows.push({
    status: verdict.ok ? "ok" : "FAIL",
    severity: "soft",
    name: `colour fidelity (${plan.slot})`,
    detail: `source rgb ${rgb(source)} vs render ${rgb(output)}; worst channel diff ${verdict.maxDiff.toFixed(1)} (limit ${COLOUR_MAX_CHANNEL_DIFF})`,
  });
  return rows;
}

export async function verifyRender(
  options: VerifyOptions,
): Promise<VerifyResult> {
  const { file, ffPaths, signal } = options;
  const recipe = options.recipe ?? null;
  const explicitSeconds = options.expectedSeconds ?? null;
  if (recipe && options.mediaRoot === undefined) {
    throw new Error("verifyRender needs a mediaRoot together with a recipe.");
  }

  const probe = await runCapture(
    ffPaths.ffprobe,
    ["-v", "error", "-print_format", "json", "-show_streams", file],
    signal ? { signal } : {},
  );
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

  const rows: VerifyRow[] = checkOutputSpec(probeJson, {
    durationSeconds: expectedSeconds,
    fps: 30,
    width: 1080,
    height: 1920,
    hasAudio: true,
    durationToleranceSeconds: DURATION_TOLERANCE,
  }).map((check) => ({
    status: check.ok ? "ok" : "FAIL",
    severity: "hard",
    name: check.name,
    detail: check.detail,
  }));

  const order = topLevelBoxOrder(await readFile(file));
  rows.push({
    status: isFastStart(order) ? "ok" : "FAIL",
    severity: "hard",
    name: "faststart (moov before mdat)",
    detail: order.join(" > "),
  });

  if (recipe) {
    try {
      rows.push(
        ...(await recipeChecks(
          ffPaths.ffmpeg,
          file,
          recipe,
          options.mediaRoot ?? "",
          signal,
        )),
      );
    } catch (error) {
      if (!options.catchSoftErrors || isAbortError(error)) {
        throw error;
      }
      rows.push({
        status: "FAIL",
        severity: "soft",
        name: "recipe checks",
        detail: `could not run: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const hardFailures = rows.filter(
    (row) => row.severity === "hard" && row.status === "FAIL",
  );
  const warnings = rows.filter(
    (row) => row.severity === "soft" && row.status === "FAIL",
  );
  return {
    rows,
    notes,
    expectedSeconds,
    ok: hardFailures.length === 0,
    hardFailures,
    warnings,
  };
}

// "name: detail" lines, for job errors and the done-state warning list.
export function describeRows(rows: readonly VerifyRow[]): string[] {
  return rows.map((row) => `${row.name}: ${row.detail}`);
}
