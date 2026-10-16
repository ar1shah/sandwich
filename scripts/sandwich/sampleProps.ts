// Shared by npm run studio and npm run frames: serve fixtures/ over the real media server
// and build the Sandwich inputProps from fixtures/sample.recipe.json.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  startMediaServer,
  type MediaServer,
} from "../../src/main/media/mediaServer";
import { RecipeSchema } from "../../src/shared/recipe";
import type { SandwichProps } from "../../remotion/types";

export const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES_DIR = path.join(PROJECT_ROOT, "fixtures");
const SAMPLE_RECIPE = path.join(FIXTURES_DIR, "sample.recipe.json");

export async function startFixturesServer(): Promise<MediaServer> {
  if (!existsSync(SAMPLE_RECIPE)) {
    throw new Error(
      `Missing ${path.relative(PROJECT_ROOT, SAMPLE_RECIPE)}. Run "npm run fixtures" first.`,
    );
  }
  return startMediaServer({ getRoot: () => FIXTURES_DIR });
}

export async function loadSampleProps(
  mediaBaseUrl: string,
): Promise<SandwichProps> {
  const recipe = RecipeSchema.parse(
    JSON.parse(await readFile(SAMPLE_RECIPE, "utf8")),
  );
  return { recipe, mediaBaseUrl, showSafeZone: true, showTimecode: true };
}
