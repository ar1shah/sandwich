// npm run frames
//
// Renders still frames of the Sandwich composition for fixtures/sample.recipe.json into
// out/frames/, with the safe-zone rectangle and timecode label drawn. A fast visual check
// of trim, zoom and captions without opening Studio.
import {
  ensureBrowser,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { bundleRemotionProject } from "../src/main/render/remotion-bundle";
import { SANDWICH_COMPOSITION_ID } from "../remotion/Root";
import {
  loadSampleProps,
  PROJECT_ROOT,
  startFixturesServer,
} from "./sandwich/sampleProps";

// Frame numbers assume the sample recipe: before 0-89, after 90-209, b-roll 210-359.
const FRAMES: { frame: number; label: string }[] = [
  { frame: 0, label: "before-start" },
  { frame: 45, label: "before-mid-slow-push" },
  { frame: 89, label: "before-last-slow-push-1.12" },
  { frame: 90, label: "after-start-box" },
  { frame: 94, label: "after-mid-punch-in" },
  { frame: 210, label: "broll-start-long-caption" },
  { frame: 359, label: "last-frame" },
];

async function main(): Promise<void> {
  const outDir = path.join(PROJECT_ROOT, "out", "frames");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const server = await startFixturesServer();
  try {
    console.log(`[frames] media server on port ${server.port}`);
    const inputProps = await loadSampleProps(server.baseUrl);

    await ensureBrowser();
    const serveUrl = await bundleRemotionProject({ projectRoot: PROJECT_ROOT });
    const composition = await selectComposition({
      serveUrl,
      id: SANDWICH_COMPOSITION_ID,
      inputProps,
    });
    console.log(
      `[frames] ${composition.width}x${composition.height} @ ${composition.fps} fps, ${composition.durationInFrames} frames`,
    );

    for (const { frame, label } of FRAMES) {
      const output = path.join(
        outDir,
        `frame-${String(frame).padStart(4, "0")}-${label}.png`,
      );
      await renderStill({
        composition,
        serveUrl,
        output,
        frame,
        inputProps,
        imageFormat: "png",
        overwrite: true,
      });
      console.log(`[frames] ${path.relative(PROJECT_ROOT, output)}`);
    }
  } finally {
    await server.close();
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(
      `[frames] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    process.exit(1);
  },
);
