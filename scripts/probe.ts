// npm run probe -- <file>: prints the ProbeResult for a video file.
import path from "node:path";
import { resolveFfPaths } from "../src/main/media/binaries";
import { probeFile } from "../src/main/media/probe";

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    throw new Error("Usage: npm run probe -- <file>");
  }

  const { ffprobe } = resolveFfPaths({
    isPackaged: false,
    appPath: process.cwd(),
    resourcesPath: "",
    platform: process.platform,
    arch: process.arch,
  });

  const result = await probeFile(ffprobe, path.resolve(file));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(
    `[probe] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
