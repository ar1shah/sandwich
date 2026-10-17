import { app } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { startMediaServer } from "../media/mediaServer";
import { RecipeSchema } from "../../shared/recipe";
import { renderRecipe } from "./render-recipe";

// Scripted render of a recipe, used to prove the packaged app can render the real
// composition without clicking through a UI:
//   Sandwich --render-recipe <abs recipe.json> <abs out.mp4> [--media-root <abs dir>]
// The media root defaults to the recipe's folder. Writes <out>.result.json next to the
// output (timings, packaged flag; never the media token), exits 0 on success and 1 on failure.
export type RenderRecipeTestArgs = {
  recipePath: string;
  outputPath: string;
  mediaRoot: string;
};

export function getRenderRecipeTestArgs(
  argv: readonly string[],
): RenderRecipeTestArgs | null {
  const flagIndex = argv.indexOf("--render-recipe");
  if (flagIndex === -1) {
    return null;
  }
  const recipePath = argv[flagIndex + 1];
  const outputPath = argv[flagIndex + 2];
  if (!recipePath || !outputPath) {
    throw new Error(
      "Usage: --render-recipe <abs recipe.json> <abs out.mp4> [--media-root <abs dir>]",
    );
  }
  const rootIndex = argv.indexOf("--media-root");
  const mediaRoot =
    (rootIndex === -1 ? undefined : argv[rootIndex + 1]) ??
    path.dirname(recipePath);
  for (const value of [recipePath, outputPath, mediaRoot]) {
    // A packaged app chdirs to userData, so relative paths would silently point elsewhere.
    if (!path.isAbsolute(value)) {
      throw new Error(`Render test paths must be absolute, got "${value}".`);
    }
  }
  return { recipePath, outputPath, mediaRoot };
}

export async function runRenderRecipeTest({
  recipePath,
  outputPath,
  mediaRoot,
}: RenderRecipeTestArgs): Promise<void> {
  const resultPath = `${outputPath}.result.json`;
  let server: Awaited<ReturnType<typeof startMediaServer>> | null = null;
  try {
    const recipe = RecipeSchema.parse(
      JSON.parse(await readFile(recipePath, "utf8")),
    );
    server = await startMediaServer({ getRoot: () => mediaRoot });
    let lastPercent = -1;
    const result = await renderRecipe(recipe, {
      outputPath,
      mediaBaseUrl: server.baseUrl,
      isPackaged: app.isPackaged,
      projectRoot: app.getAppPath(),
      onProgress: (update) => {
        if (update.type === "status") {
          console.log(`[render-test] ${update.message}`);
        } else if (update.stage === "rendering") {
          const percent = Math.floor(update.progress / 25) * 25;
          if (percent !== lastPercent) {
            lastPercent = percent;
            console.log(`[render-test] rendering ${percent}%`);
          }
        }
      },
    });
    const summary = {
      ok: !result.cancelled,
      packaged: app.isPackaged,
      outputPath,
      result,
      arch: process.arch,
      electronVersion: process.versions.electron,
      error: null,
    };
    await writeFile(resultPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    app.exit(result.cancelled ? 1 : 0);
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(`[render-test] failed: ${message}`);
    await writeFile(
      resultPath,
      JSON.stringify(
        { ok: false, packaged: app.isPackaged, outputPath, error: message },
        null,
        2,
      ),
    ).catch(() => undefined);
    app.exit(1);
  } finally {
    await server?.close();
  }
}
