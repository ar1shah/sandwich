// npm run ffmpeg:fetch [-- <target>...]   e.g. darwin-x64 win32-x64. Default: this machine.
// Also runs on postinstall with --postinstall, where an unsupported host only warns.
import {
  FF_TARGETS,
  getFfTarget,
  type FfTarget,
} from "../src/main/media/binaries";
import { ensureFfBinaries } from "./ffmpeg/fetch";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isPostinstall = args.includes("--postinstall");
  const requested = args.filter((arg) => !arg.startsWith("--"));

  let targets: FfTarget[];
  if (requested.length > 0) {
    const unknown = requested.filter(
      (arg) => !(FF_TARGETS as readonly string[]).includes(arg),
    );
    if (unknown.length > 0) {
      throw new Error(
        `Unknown target(s): ${unknown.join(", ")}. Use one of: ${FF_TARGETS.join(", ")}`,
      );
    }
    targets = requested as FfTarget[];
  } else {
    const host = getFfTarget(process.platform, process.arch);
    if (!host) {
      const message = `No bundled FFmpeg for ${process.platform}-${process.arch}.`;
      if (isPostinstall) {
        console.warn(`[ffmpeg:fetch] ${message} Skipping.`);
        return;
      }
      throw new Error(message);
    }
    targets = [host];
  }

  for (const target of targets) {
    await ensureFfBinaries({
      projectRoot: process.cwd(),
      target,
      log: (message) => console.log(`[ffmpeg:fetch] ${message}`),
    });
  }
}

main().catch((error: unknown) => {
  console.error(
    `[ffmpeg:fetch] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
