// npx tsx scripts/make-real-recipe.ts
//
// Builds out/normalized/real.recipe.json from the normalized real clips that
// `npm run test:normalize` leaves in out/normalized/ (real_iphone_hdr.mp4,
// real_screen_recording.mp4, real_creator_horizontal.mp4). Then:
//   npm run render -- out/normalized/real.recipe.json out/real.mp4
//   npm run verify:render -- out/real.mp4 --recipe out/normalized/real.recipe.json
// The media root defaults to the recipe's folder, so the paths below are just file names.
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDevFfPaths } from "../src/main/media/binaries";
import { probeFile } from "../src/main/media/probe";
import {
  createEmptyRecipe,
  RecipeSchema,
  type ClipSpec,
  type Recipe,
} from "../src/shared/recipe";

const DIR = path.resolve(__dirname, "..", "out", "normalized");

type Plan = {
  file: string;
  trimStart: number;
  duration: number;
  zoom: ClipSpec["zoom"];
  caption: ClipSpec["caption"];
};

// Before: plain (no zoom, no caption) so verify:render can compare its colours with the
// source. After: slow push with a box caption. B-roll: muted, outline caption on top.
const PLANS: [Plan, Plan, Plan] = [
  {
    file: "real_iphone_hdr.mp4",
    trimStart: 1,
    duration: 3,
    zoom: "none",
    caption: null,
  },
  {
    file: "real_screen_recording.mp4",
    trimStart: 2,
    duration: 4,
    zoom: "slow-push",
    caption: { text: "Two weeks later", style: "box", position: "middle" },
  },
  {
    file: "real_creator_horizontal.mp4",
    trimStart: 0,
    duration: 5,
    zoom: "punch-in",
    caption: {
      text: "Tap the basket before it sells out",
      style: "outline",
      position: "top",
    },
  },
];

async function main(): Promise<void> {
  const { ffprobe } = resolveDevFfPaths();
  const base = createEmptyRecipe(
    { id: "real-clips", slug: "real-clips" },
    { clipDurations: { before: 3, after: 4, broll: 5 } },
    { id: "00000000-0000-4000-8000-0000000000a5", now: new Date(0) },
  );

  const clips = [];
  for (const [index, plan] of PLANS.entries()) {
    const file = path.join(DIR, plan.file);
    if (!existsSync(file)) {
      throw new Error(
        `Missing ${path.relative(process.cwd(), file)}. Run "npm run test:normalize" with clips in fixtures/real/ first.`,
      );
    }
    const probe = await probeFile(ffprobe, file);
    // Clamp so the window always fits inside the source.
    const duration = Math.min(plan.duration, probe.duration);
    const trimStart = Math.min(
      plan.trimStart,
      Math.max(0, probe.duration - duration),
    );
    const slotClip = base.clips[index];
    if (!slotClip) {
      throw new Error(`No slot ${index}`);
    }
    clips.push({
      ...slotClip,
      mediaPath: plan.file,
      sourceDuration: probe.duration,
      trimStart,
      duration,
      zoom: plan.zoom,
      caption: plan.caption,
    });
  }

  const recipe: Recipe = RecipeSchema.parse({
    ...base,
    clips,
  });
  const out = path.join(DIR, "real.recipe.json");
  await writeFile(out, `${JSON.stringify(recipe, null, 2)}\n`);
  console.log(`[make-real-recipe] wrote ${path.relative(process.cwd(), out)}`);
}

main().catch((error: unknown) => {
  console.error(
    `[make-real-recipe] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
