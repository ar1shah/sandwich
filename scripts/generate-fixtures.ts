// npm run fixtures [-- --force]: generates deterministic test media into fixtures/.
// Re-runs only regenerate fixtures whose ffmpeg arguments, ffmpeg build, font or generator
// version changed (see fixtures/.manifest.json).
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { resolveFfPaths } from "../src/main/media/binaries";
import { probeFile } from "../src/main/media/probe";
import { runCapture, runCaptureBuffer } from "../src/main/media/run";
import { parseEncoderNames } from "../src/shared/capabilitiesParse";
import type { ProbeResult } from "../src/shared/probeParse";
import {
  buildFixtureCommands,
  buildSampleRecipe,
  checkProbe,
  describeProbe,
  FIXTURES,
  FIXTURES_DIR,
  FONT_FILE,
  formatBytes,
  formatTable,
  hashFixture,
  redFraction,
  type FixtureSpec,
} from "./fixtures/specs";

const ROOT = process.cwd();
const FIXTURES_ABS = path.join(ROOT, FIXTURES_DIR);
const MANIFEST = path.join(FIXTURES_ABS, ".manifest.json");
const ENCODE_TIMEOUT_MS = 5 * 60_000;
const RED_STRIP_HEIGHT = 20;
const RED_MIN_FRACTION = 0.9;

type Manifest = Record<string, string>;
type Status = "new" | "cached" | "FAILED";

function readManifest(): Manifest {
  try {
    const parsed: unknown = JSON.parse(readFileSync(MANIFEST, "utf8"));
    if (parsed && typeof parsed === "object") {
      return parsed as Manifest;
    }
  } catch {
    // Missing or unreadable manifest: everything regenerates.
  }
  return {};
}

function fileSize(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

// Decodes the top strip of the first frame with autorotate on and measures how red it is.
// A wrong rotation sign puts the red bar on a side edge and this fails.
async function topStripRedFraction(
  ffmpeg: string,
  file: string,
  width: number,
): Promise<number> {
  const { stdout } = await runCaptureBuffer(
    ffmpeg,
    [
      "-v",
      "error",
      "-i",
      path.posix.join(FIXTURES_DIR, file),
      "-vf",
      `crop=iw:${RED_STRIP_HEIGHT}:0:0,format=rgb24`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-",
    ],
    { cwd: ROOT },
  );
  const expected = width * RED_STRIP_HEIGHT * 3;
  if (stdout.length !== expected) {
    throw new Error(
      `pixel check got ${stdout.length} bytes for ${file}, expected ${expected} (${width}x${RED_STRIP_HEIGHT} rgb24)`,
    );
  }
  return redFraction(stdout);
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const paths = resolveFfPaths({
    isPackaged: false,
    appPath: ROOT,
    resourcesPath: "",
    platform: process.platform,
    arch: process.arch,
  });
  for (const bin of [paths.ffmpeg, paths.ffprobe]) {
    if (!existsSync(bin)) {
      throw new Error(`Missing ${bin}. Run npm run ffmpeg:fetch first.`);
    }
  }
  const fontPath = path.join(ROOT, FONT_FILE);
  if (!existsSync(fontPath)) {
    throw new Error(`Missing font ${FONT_FILE} (bundled in assets/fonts/).`);
  }

  const encoders = parseEncoderNames(
    (await runCapture(paths.ffmpeg, ["-hide_banner", "-encoders"])).stdout,
  );
  for (const encoder of ["libx264", "libx265", "aac"]) {
    if (!encoders.has(encoder)) {
      throw new Error(
        `The bundled ffmpeg has no ${encoder} encoder; HDR fixtures are required (see DECISIONS #8).`,
      );
    }
  }

  const ffmpegVersion =
    (await runCapture(paths.ffmpeg, ["-hide_banner", "-version"])).stdout
      .split("\n")[0]
      ?.trim() ?? "unknown";
  const fontSha256 = createHash("sha256")
    .update(readFileSync(fontPath))
    .digest("hex");

  mkdirSync(FIXTURES_ABS, { recursive: true });
  const manifest = force ? {} : readManifest();
  const failures: string[] = [];
  const rows: string[][] = [];
  const probes = new Map<string, ProbeResult>();

  for (const spec of FIXTURES) {
    const commands = buildFixtureCommands(spec);
    const hash = hashFixture({
      steps: commands.steps,
      ffmpegVersion,
      fontSha256,
    });
    const finalPath = path.join(FIXTURES_ABS, spec.name);
    let status: Status = "new";

    if (manifest[spec.name] === hash && fileSize(finalPath) > 0) {
      status = "cached";
    } else {
      const tempPath = path.join(ROOT, commands.output);
      try {
        for (const file of [tempPath, ...commands.intermediates]) {
          rmSync(path.join(ROOT, file), { force: true });
        }
        for (const args of commands.steps) {
          await runCapture(paths.ffmpeg, args, {
            cwd: ROOT,
            timeoutMs: ENCODE_TIMEOUT_MS,
          });
        }
        if (fileSize(tempPath) === 0) {
          throw new Error("ffmpeg produced an empty file");
        }
        renameSync(tempPath, finalPath);
        manifest[spec.name] = hash;
        writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
      } catch (error) {
        status = "FAILED";
        delete manifest[spec.name];
        failures.push(
          `${spec.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        for (const file of [tempPath, ...commands.intermediates]) {
          rmSync(path.join(ROOT, file), { force: true });
        }
      }
    }

    const size = formatBytes(fileSize(finalPath));
    if (status === "FAILED") {
      rows.push([spec.name, ...Array(9).fill("-"), size, status]);
      continue;
    }

    try {
      const probe = await probeFile(paths.ffprobe, finalPath);
      probes.set(spec.name, probe);
      const problems = checkProbe(spec, probe);
      for (const problem of problems) {
        failures.push(`${spec.name}: ${problem}`);
      }
      const cells =
        spec.kind === "image"
          ? [
              "image",
              `${probe.width}x${probe.height}`,
              "-",
              "-",
              "-",
              "-",
              "-",
              probe.pixFmt ?? "?",
              "-",
            ]
          : describeProbe(probe);
      rows.push([
        spec.name,
        ...cells,
        size,
        problems.length > 0 ? "FAILED" : status,
      ]);
    } catch (error) {
      failures.push(
        `${spec.name}: probe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      rows.push([spec.name, ...Array(9).fill("-"), size, "FAILED"]);
    }
  }

  // Rotation pixel check, plus the upright clip as a control for the check itself.
  const pixelChecks: [FixtureSpec["name"], number][] = [
    ["vertical_1080x1920_30.mp4", 1080],
    ["rotated_90.mp4", 1080],
  ];
  const pixelLines: string[] = [];
  for (const [file, width] of pixelChecks) {
    try {
      const fraction = await topStripRedFraction(paths.ffmpeg, file, width);
      const ok = fraction >= RED_MIN_FRACTION;
      pixelLines.push(
        `${ok ? "ok  " : "FAIL"} ${file}: top ${RED_STRIP_HEIGHT}px is ${(fraction * 100).toFixed(1)}% red after autorotate`,
      );
      if (!ok) {
        failures.push(
          `${file}: top strip only ${(fraction * 100).toFixed(1)}% red (need ${RED_MIN_FRACTION * 100}%), rotation is wrong`,
        );
      }
    } catch (error) {
      failures.push(
        `${file}: pixel check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const before = probes.get("vertical_1080x1920_30.mp4");
  const after = probes.get("vertical_b_1080x1920_30.mp4");
  if (before && after) {
    const recipe = buildSampleRecipe({
      before: before.duration,
      after: after.duration,
      broll: before.duration,
    });
    writeFileSync(
      path.join(FIXTURES_ABS, "sample.recipe.json"),
      `${JSON.stringify(recipe, null, 2)}\n`,
    );
  } else {
    failures.push("sample.recipe.json not written: source probes missing");
  }

  console.log(
    formatTable(
      [
        "file",
        "duration",
        "coded",
        "rot",
        "display",
        "fps",
        "vfr",
        "audio",
        "pix_fmt / transfer",
        "hdr",
        "size",
        "status",
      ],
      rows,
    ),
  );
  console.log("");
  for (const line of pixelLines) {
    console.log(line);
  }
  console.log(`\nffmpeg: ${ffmpegVersion}`);
  console.log(`font:   ${FONT_FILE}`);
  console.log(`output: ${FIXTURES_DIR}/ (+ sample.recipe.json)`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} problem(s):`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(
    `[fixtures] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
