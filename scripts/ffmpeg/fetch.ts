import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  type FfTarget,
  type FfTool,
  getFfBinaryName,
  getVendorFfDir,
} from "../../src/main/media/binaries";

// Pinned builds from the ffmpeg-static project's GitHub release (see DECISIONS #8).
// Hashes are SHA-256 of the decompressed binary, recorded when the pin was made.
const RELEASE_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1";

const PINNED: Record<FfTarget, Record<FfTool, string>> = {
  "darwin-arm64": {
    ffmpeg: "a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584",
    ffprobe: "bb2db6f5d8cef919da12fbf592119a987202a8c060a886f3cab091f9cab90b64",
  },
  "darwin-x64": {
    ffmpeg: "ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894",
    ffprobe: "fa3add0ce901f7241abe0dfc0155d958fc834aca3f8ce61f87cc712ae669c1e0",
  },
  "win32-x64": {
    ffmpeg: "04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00",
    ffprobe: "3a7e2dc003dc2cd1472827e4c7c4f056ae1ae0ae7c5bbc580c99b49827351ba4",
  },
};

const TOOLS: FfTool[] = ["ffmpeg", "ffprobe"];

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function fileMatches(
  filePath: string,
  expected: string,
): Promise<boolean> {
  if (!existsSync(filePath)) {
    return false;
  }
  return sha256(await readFile(filePath)) === expected;
}

async function fetchTool(
  target: FfTarget,
  tool: FfTool,
  destination: string,
  log: (message: string) => void,
): Promise<void> {
  const expected = PINNED[target][tool];
  if (await fileMatches(destination, expected)) {
    log(`${tool} ${target}: present, hash ok`);
    return;
  }

  const url = `${RELEASE_URL}/${tool}-${target}.gz`;
  log(`${tool} ${target}: downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  const binary = gunzipSync(Buffer.from(await response.arrayBuffer()));
  const actual = sha256(binary);
  if (actual !== expected) {
    throw new Error(
      `Hash mismatch for ${tool} ${target}: expected ${expected}, got ${actual}`,
    );
  }

  const temp = `${destination}.download`;
  await writeFile(temp, binary);
  await chmod(temp, 0o755);
  await rename(temp, destination);
  log(`${tool} ${target}: installed`);
}

// Makes sure vendor/ffmpeg/<target>/ holds hash-verified ffmpeg + ffprobe. Returns the folder.
export async function ensureFfBinaries({
  projectRoot,
  target,
  log = console.log,
}: {
  projectRoot: string;
  target: FfTarget;
  log?: (message: string) => void;
}): Promise<string> {
  const dir = getVendorFfDir(projectRoot, target);
  await mkdir(dir, { recursive: true });
  const platform = target.split("-")[0] ?? "";
  for (const tool of TOOLS) {
    await fetchTool(
      target,
      tool,
      path.join(dir, getFfBinaryName(tool, platform)),
      log,
    );
  }
  return dir;
}
