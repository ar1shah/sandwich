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
import { verifyRender } from "../src/main/render/verify";
import { RecipeSchema, type Recipe } from "../src/shared/recipe";

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
  // The script reports every FAIL, hard or soft, and exits 1 on any of them; the severity
  // split only matters to the export job.
  const { rows, notes } = await verifyRender({
    file,
    ffPaths: resolveDevFfPaths(),
    recipe,
    mediaRoot,
    expectedSeconds: explicitSeconds,
  });

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
