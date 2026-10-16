// npm run test:normalize: normalizes every fixture (and every clip in fixtures/real/) into
// out/normalized/ and asserts the result against the working-file spec.
import { existsSync, readdirSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { resolveDevFfPaths } from "../src/main/media/binaries";
import { makeFilmstrip } from "../src/main/media/filmstrip";
import { normalize } from "../src/main/media/normalize";
import { isAbortError, runCaptureBuffer } from "../src/main/media/run";
import { makeThumbnail } from "../src/main/media/thumbs";
import { jpegSize } from "../src/shared/jpegSize";
import { meanRgbStats } from "../src/shared/frameStats";
import { THUMBNAIL_WIDTH } from "../src/shared/filmstripLayout";
import { isFastStart, topLevelBoxOrder } from "../src/shared/mp4Boxes";
import {
  checkNormalized,
  type NormalizeCheck,
} from "../src/shared/normalizeCheck";
import type { ProbeResult } from "../src/shared/probeParse";
import { describeProbe, formatTable } from "./fixtures/specs";

const FIXTURES_DIR = path.resolve("fixtures");
const REAL_DIR = path.join(FIXTURES_DIR, "real");
const OUT_DIR = path.resolve("out", "normalized");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);

type Case = { name: string; input: string; output: string; real: boolean };

function listVideos(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((file) => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort()
    .map((file) => path.join(dir, file));
}

function buildCases(): Case[] {
  const cases = (files: string[], real: boolean): Case[] =>
    files.map((input) => {
      const stem = path.basename(input, path.extname(input));
      return {
        name: real ? `real/${path.basename(input)}` : path.basename(input),
        input,
        output: path.join(OUT_DIR, real ? `real_${stem}.mp4` : `${stem}.mp4`),
        real,
      };
    });
  return [
    ...cases(listVideos(FIXTURES_DIR), false),
    ...cases(listVideos(REAL_DIR), true),
  ];
}

async function firstFramesRgb(
  file: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const { ffmpeg } = resolveDevFfPaths();
  const { stdout } = await runCaptureBuffer(ffmpeg, [
    "-v",
    "error",
    "-nostdin",
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    `scale=${width}:${height},format=rgb24`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-",
  ]);
  return stdout;
}

// Share of pixels in rows [from, to) whose red clearly dominates. Lenient on purpose:
// tone mapped HDR red is not exactly (255, 0, 0).
function redDominantShare(
  rgb: Uint8Array,
  width: number,
  rowFrom: number,
  rowTo: number,
): number {
  let red = 0;
  let total = 0;
  for (let row = rowFrom; row < rowTo; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const at = (row * width + col) * 3;
      const r = rgb[at] ?? 0;
      const g = rgb[at + 1] ?? 0;
      const b = rgb[at + 2] ?? 0;
      total += 1;
      if (r > g + 60 && r > b + 60) {
        red += 1;
      }
    }
  }
  return total === 0 ? 0 : red / total;
}

// The fixtures draw a red bar along the top of every upright frame, so after normalizing
// the top rows must be red and the bottom rows must not. Proves rotation is baked into
// the pixels, not just hidden in metadata.
async function checkOrientation(
  file: string,
  probe: ProbeResult,
): Promise<NormalizeCheck> {
  const height = 480;
  const width = Math.max(2, Math.round((height * probe.width) / probe.height));
  const rgb = await firstFramesRgb(file, width, height);
  const band = 3;
  const top = redDominantShare(rgb, width, 0, band);
  const bottom = redDominantShare(rgb, width, height - band, height);
  return {
    name: "upright (red bar on top)",
    ok: top > 0.8 && bottom < 0.1,
    detail: `top ${(top * 100).toFixed(0)}% red, bottom ${(bottom * 100).toFixed(0)}% red`,
  };
}

async function checkFaststart(file: string): Promise<NormalizeCheck> {
  const order = topLevelBoxOrder(new Uint8Array(await readFile(file)));
  return {
    name: "faststart",
    ok: isFastStart(order),
    detail: order.join(" > "),
  };
}

async function checkAuxiliary(
  output: string,
  probe: ProbeResult,
  real: boolean,
): Promise<NormalizeCheck[]> {
  const checks: NormalizeCheck[] = [];
  const stem = output.replace(/\.mp4$/, "");

  const thumbPath = `${stem}.jpg`;
  await makeThumbnail(output, thumbPath, { duration: probe.duration });
  const thumb = jpegSize(new Uint8Array(await readFile(thumbPath)));
  checks.push({
    name: "thumbnail width",
    ok: thumb?.width === THUMBNAIL_WIDTH,
    detail: thumb ? `${thumb.width}x${thumb.height}` : "unreadable",
  });

  const stripPath = `${stem}_filmstrip.jpg`;
  const strip = await makeFilmstrip(output, stripPath, {
    duration: probe.duration,
    width: probe.displayWidth,
    height: probe.displayHeight,
  });
  const size = jpegSize(new Uint8Array(await readFile(stripPath)));
  const expectedWidth = strip.frameCount * strip.frameWidth;
  checks.push({
    name: "filmstrip size",
    ok: size?.width === expectedWidth && size.height === strip.frameHeight,
    detail: size
      ? `${size.width}x${size.height}, expected ${expectedWidth}x${strip.frameHeight} (${strip.frameCount} frames)`
      : "unreadable",
  });

  if (size && !real) {
    // tile pads with black at EOF when fewer frames come out than predicted. Fixtures are
    // bright solid colours, so a dark last cell means padding.
    const rgb = await firstFramesRgb(stripPath, size.width, size.height);
    const cellStart = (strip.frameCount - 1) * strip.frameWidth;
    const cell = new Uint8Array(strip.frameWidth * size.height * 3);
    for (let row = 0; row < size.height; row += 1) {
      const from = (row * size.width + cellStart) * 3;
      cell.set(
        rgb.subarray(from, from + strip.frameWidth * 3),
        row * strip.frameWidth * 3,
      );
    }
    const luma = meanRgbStats(cell).y;
    checks.push({
      name: "filmstrip last cell",
      ok: luma > 20,
      detail: `mean luma ${luma.toFixed(0)}`,
    });
  }
  return checks;
}

type Outcome = {
  name: string;
  checks: NormalizeCheck[];
  error?: string;
  seconds: number;
  probe?: ProbeResult;
  outputProbe?: ProbeResult;
};

async function runCase(testCase: Case): Promise<Outcome> {
  const started = Date.now();
  try {
    const result = await normalize(testCase.input, testCase.output);
    const seconds = (Date.now() - started) / 1000;
    const checks = checkNormalized(result.probe, result.outputProbe);
    checks.push(await checkFaststart(testCase.output));
    if (!testCase.real) {
      // Only the generated fixtures carry the red bar.
      checks.push(await checkOrientation(testCase.output, result.outputProbe));
    }
    checks.push(
      ...(await checkAuxiliary(
        testCase.output,
        result.outputProbe,
        testCase.real,
      )),
    );
    if (result.wasHdr) {
      checks.push({
        name: "tone map path",
        ok: result.toneMapPath === "zscale",
        detail: String(result.toneMapPath),
      });
    }
    return {
      name: testCase.name,
      checks,
      seconds,
      probe: result.probe,
      outputProbe: result.outputProbe,
    };
  } catch (error) {
    return {
      name: testCase.name,
      checks: [],
      error: error instanceof Error ? error.message : String(error),
      seconds: (Date.now() - started) / 1000,
    };
  }
}

// Cancels a transcode mid-run and checks that nothing is left behind.
async function runAbortCases(): Promise<NormalizeCheck[]> {
  const checks: NormalizeCheck[] = [];
  const slow =
    listVideos(REAL_DIR)[0] ?? path.join(FIXTURES_DIR, "hdr_hlg_10bit.mov");
  const output = path.join(OUT_DIR, "abort_test.mp4");
  const partial = `${output}.partial`;
  await rm(output, { force: true });
  await rm(partial, { force: true });

  const controller = new AbortController();
  let progressEvents = 0;
  let outcome = "completed before it could be aborted";
  try {
    await normalize(slow, output, {
      signal: controller.signal,
      onProgress: () => {
        progressEvents += 1;
        controller.abort();
      },
    });
  } catch (error) {
    outcome = isAbortError(error) ? "aborted" : `failed: ${String(error)}`;
  }
  checks.push({
    name: "abort rejects with AbortError",
    ok: outcome === "aborted",
    detail: `${outcome} after ${progressEvents} progress events (${path.basename(slow)})`,
  });
  const leftovers = (await readdir(OUT_DIR)).filter((file) =>
    file.startsWith("abort_test.mp4"),
  );
  checks.push({
    name: "abort leaves no files",
    ok: leftovers.length === 0,
    detail: leftovers.length === 0 ? "clean" : leftovers.join(", "),
  });

  const pre = new AbortController();
  pre.abort();
  let preAborted = false;
  try {
    await normalize(slow, output, { signal: pre.signal });
  } catch (error) {
    preAborted = isAbortError(error);
  }
  const leftoversAfter = (await readdir(OUT_DIR)).filter((file) =>
    file.startsWith("abort_test.mp4"),
  );
  checks.push({
    name: "pre-aborted signal",
    ok: preAborted && leftoversAfter.length === 0,
    detail: preAborted
      ? "rejected, no files"
      : "did not reject with AbortError",
  });
  return checks;
}

async function main(): Promise<void> {
  const cases = buildCases();
  if (cases.length === 0) {
    throw new Error("No fixtures found. Run `npm run fixtures` first.");
  }
  await (await import("node:fs/promises")).mkdir(OUT_DIR, { recursive: true });

  const outcomes: Outcome[] = [];
  for (const testCase of cases) {
    process.stderr.write(`normalizing ${testCase.name}...\n`);
    outcomes.push(await runCase(testCase));
  }

  const rows = outcomes.map((outcome) => {
    const failed = outcome.checks.filter((check) => !check.ok);
    const status = outcome.error
      ? "ERROR"
      : failed.length === 0
        ? "PASS"
        : "FAIL";
    const speed =
      outcome.probe && outcome.seconds > 0
        ? `${(outcome.probe.duration / outcome.seconds).toFixed(1)}x`
        : "-";
    const notes = outcome.error
      ? (outcome.error.split("\n")[0] ?? "")
      : failed.map((check) => `${check.name}: ${check.detail}`).join("; ");
    return [
      outcome.name,
      status,
      `${outcome.checks.filter((c) => c.ok).length}/${outcome.checks.length}`,
      `${outcome.seconds.toFixed(1)} s`,
      speed,
      notes,
    ];
  });
  console.log("\nNormalization results\n");
  console.log(
    formatTable(
      ["clip", "result", "checks", "time", "speed", "failures"],
      rows,
    ),
  );

  const real = outcomes.filter(
    (o) => o.name.startsWith("real/") && o.probe && o.outputProbe,
  );
  if (real.length > 0) {
    console.log("\nReal clips, probe before vs after\n");
    const headers = [
      "clip",
      "",
      "duration",
      "coded",
      "rot",
      "display",
      "fps",
      "vfr",
      "audio",
      "pix/transfer",
      "hdr",
    ];
    const table: string[][] = [];
    for (const o of real) {
      table.push([o.name, "before", ...describeProbe(o.probe as ProbeResult)]);
      table.push(["", "after", ...describeProbe(o.outputProbe as ProbeResult)]);
    }
    console.log(formatTable(headers, table));
    console.log("");
    console.log(
      formatTable(
        ["clip", "wall time", "clip length", "speed"],
        real.map((o) => [
          o.name,
          `${o.seconds.toFixed(1)} s`,
          `${(o.probe as ProbeResult).duration.toFixed(1)} s`,
          `${((o.probe as ProbeResult).duration / o.seconds).toFixed(1)}x realtime`,
        ]),
      ),
    );
  }

  const abortChecks = await runAbortCases();
  console.log("\nCancellation\n");
  console.log(
    formatTable(
      ["check", "result", "detail"],
      abortChecks.map((c) => [c.name, c.ok ? "PASS" : "FAIL", c.detail]),
    ),
  );

  const failed =
    outcomes.some((o) => o.error || o.checks.some((c) => !c.ok)) ||
    abortChecks.some((c) => !c.ok);
  console.log(failed ? "\nFAILED" : "\nAll normalization checks passed.");
  if (failed) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(
    `[test-normalize] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
