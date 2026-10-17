// npm run render -- <recipe.json> <out.mp4> [--media-root <dir>]
//
// Renders a recipe to an mp4 with the same renderRecipe() the app uses. Media paths in the
// recipe are relative to the media root, which defaults to the recipe file's directory
// (fixtures/sample.recipe.json -> fixtures/). The CLI starts the real media server itself.
// Ctrl+C stops the render and leaves no partial output file.
import { rmSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { startMediaServer } from "../src/main/media/mediaServer";
import {
  prepareServeUrl,
  renderRecipe,
} from "../src/main/render/render-recipe";
import type { RenderUpdate } from "../src/main/render/types";
import { RecipeSchema } from "../src/shared/recipe";

const PROJECT_ROOT = path.resolve(__dirname, "..");

function progressPrinter(): (update: RenderUpdate) => void {
  let last = "";
  return (update) => {
    if (update.type === "status") {
      console.log(`[render] ${update.message}`);
      return;
    }
    if (update.stage !== "rendering") {
      return;
    }
    const line = `[render] rendering ${Math.floor(update.progress)}%`;
    if (process.stderr.isTTY) {
      process.stderr.write(`\r${line}   `);
    } else if (line !== last && Math.floor(update.progress) % 25 === 0) {
      console.log(line);
    }
    last = line;
  };
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { "media-root": { type: "string" } },
  });
  const [recipeArg, outArg] = positionals;
  if (!recipeArg || !outArg || positionals.length > 2) {
    throw new Error(
      "Usage: npm run render -- <recipe.json> <out.mp4> [--media-root <dir>]",
    );
  }

  const recipePath = path.resolve(recipeArg);
  const outputPath = path.resolve(outArg);
  const mediaRoot = path.resolve(
    values["media-root"] ?? path.dirname(recipePath),
  );
  const recipe = RecipeSchema.parse(
    JSON.parse(await readFile(recipePath, "utf8")),
  );
  await mkdir(path.dirname(outputPath), { recursive: true });

  const abort = new AbortController();
  let interrupted = false;
  // Remotion's browser runner has its own SIGINT listener that kills Chrome and calls
  // process.exit(130) right after ours, so the async cancel path cannot finish in the CLI.
  // Abort anyway (the library path is exercised by AbortSignal callers) and remove any
  // partial output synchronously before that exit.
  process.on("SIGINT", () => {
    if (interrupted) {
      process.exit(130);
    }
    interrupted = true;
    console.error(
      "\n[render] Ctrl+C: cancelling and removing the partial file",
    );
    abort.abort();
    rmSync(outputPath, { force: true });
  });

  const server = await startMediaServer({ getRoot: () => mediaRoot });
  try {
    // Port only: the base URL contains the session token.
    console.log(`[render] media server on port ${server.port}`);
    console.log(`[render] media root ${mediaRoot}`);
    const onProgress = progressPrinter();

    const prepared = await prepareServeUrl({
      isPackaged: false,
      projectRoot: PROJECT_ROOT,
      onUpdate: onProgress,
    });
    const result = await renderRecipe(recipe, {
      outputPath,
      mediaBaseUrl: server.baseUrl,
      isPackaged: false,
      projectRoot: PROJECT_ROOT,
      serveUrl: prepared.serveUrl,
      onProgress,
      signal: abort.signal,
    });
    if (process.stderr.isTTY) {
      process.stderr.write("\n");
    }

    if (result.cancelled) {
      console.log("[render] cancelled; no output file left behind");
      process.exitCode = 130;
      return;
    }
    const { timings } = result;
    console.log(`[render] wrote ${path.relative(process.cwd(), outputPath)}`);
    console.log(
      [
        `[render] bundle ${prepared.bundleMs === null ? "-" : seconds(prepared.bundleMs)}`,
        `select ${seconds(timings.selectMs)}`,
        `renderMedia ${seconds(timings.renderMs)}`,
        `total ${seconds(timings.totalMs)}`,
        `concurrency ${result.concurrency ?? "?"}`,
      ].join(" | "),
    );
    console.log(
      `[render] ${result.outputSeconds.toFixed(2)} s of video, ${(timings.renderMsPerOutputSecond / 1000).toFixed(2)} s of renderMedia time per output second`,
    );
  } finally {
    await server.close();
  }
}

main().then(
  () => process.exit(),
  (error: unknown) => {
    console.error(
      `[render] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    process.exit(1);
  },
);
