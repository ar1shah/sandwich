// npm run ffmpeg:check: prints the capability report, exits 1 if anything required is missing.
import { existsSync } from "node:fs";
import { resolveFfPaths } from "../src/main/media/binaries";
import { getFfCapabilities } from "../src/main/media/capabilities";
import { runCapture } from "../src/main/media/run";
import { formatCapabilityReport } from "../src/shared/capabilitiesParse";

async function main(): Promise<void> {
  const paths = resolveFfPaths({
    isPackaged: false,
    appPath: process.cwd(),
    resourcesPath: "",
    platform: process.platform,
    arch: process.arch,
  });

  for (const bin of [paths.ffmpeg, paths.ffprobe]) {
    if (!existsSync(bin)) {
      throw new Error(`Missing ${bin}. Run npm run ffmpeg:fetch first.`);
    }
  }

  const report = await getFfCapabilities(paths.ffmpeg);
  const probeVersion = (
    await runCapture(paths.ffprobe, ["-hide_banner", "-version"])
  ).stdout
    .split("\n")[0]
    ?.trim();

  console.log(formatCapabilityReport(report));
  console.log(`FFprobe: ${probeVersion ?? "unknown"}`);
  if (!report.ok) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(
    `[ffmpeg:check] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
