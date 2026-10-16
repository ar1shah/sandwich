// npm run verify:spike -- <rendered .mp4 ...>
// Checks the output spec (CLAUDE.md), faststart, and the audio layout of the spike:
// before (0-3 s) and after (3-7 s) audible, broll (7-12 s) silent.
// Step 1.5's verify:render supersedes this.
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveFfPaths } from "../src/main/media/binaries";
import { runCapture } from "../src/main/media/run";
import { isFastStart, topLevelBoxOrder } from "../src/shared/mp4Boxes";
import { checkOutputSpec, parseMaxVolumeDb } from "../src/shared/outputSpec";

const AUDIBLE_MIN_DB = -30;
const SILENT_MAX_DB = -60;
const WINDOWS = [
  { name: "before 0-3 s", start: 0, length: 3, audible: true },
  { name: "after 3-7 s", start: 3, length: 4, audible: true },
  { name: "broll 7-12 s", start: 7, length: 5, audible: false },
] as const;

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error("Usage: npm run verify:spike -- <file.mp4> [...]");
  }
  const { ffmpeg, ffprobe } = resolveFfPaths({
    isPackaged: false,
    appPath: process.cwd(),
    resourcesPath: "",
    platform: process.platform,
    arch: process.arch,
  });

  let failed = false;
  for (const file of files) {
    const absolute = path.resolve(file);
    console.log(`\n${absolute}`);
    const probe = await runCapture(ffprobe, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      absolute,
    ]);
    const checks = checkOutputSpec(JSON.parse(probe.stdout));

    const order = topLevelBoxOrder(readFileSync(absolute));
    checks.push({
      name: "faststart (moov before mdat)",
      ok: isFastStart(order),
      detail: order.join(" > "),
    });

    for (const window of WINDOWS) {
      const { stderr } = await runCapture(ffmpeg, [
        "-hide_banner",
        "-nostdin",
        "-ss",
        String(window.start),
        "-t",
        String(window.length),
        "-i",
        absolute,
        "-vn",
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
      ]);
      const db = parseMaxVolumeDb(stderr);
      const ok =
        db !== null &&
        (window.audible ? db > AUDIBLE_MIN_DB : db < SILENT_MAX_DB);
      checks.push({
        name: `audio ${window.name} ${window.audible ? "audible" : "silent"}`,
        ok,
        detail: db === null ? "no volumedetect output" : `max ${db} dB`,
      });
    }

    for (const check of checks) {
      console.log(
        `  ${check.ok ? "ok  " : "FAIL"} ${check.name.padEnd(34)} ${check.detail}`,
      );
      if (!check.ok) {
        failed = true;
      }
    }
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(
    `[verify:spike] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
