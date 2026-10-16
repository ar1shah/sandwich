import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { CapabilityReport } from "../../shared/capabilitiesParse";
import {
  buildNormalizeArgs,
  chooseToneMapPath,
  DEFAULT_TONE_MAP,
  type ToneMapParams,
  type ToneMapPath,
} from "../../shared/ffmpegArgs";
import { createProgressParser } from "../../shared/ffmpegProgress";
import type { ProbeResult } from "../../shared/probeParse";
import { resolveDevFfPaths, type FfPaths } from "./binaries";
import { getFfCapabilities } from "./capabilities";
import { probeFile } from "./probe";
import { runStreaming } from "./run";

export type NormalizeOptions = {
  // Percent 0..100.
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  toneMap?: ToneMapParams;
  // Defaults to vendor/ in the project root (dev and scripts). The app passes its own.
  ffPaths?: FfPaths;
};

export type NormalizeResult = {
  probe: ProbeResult;
  outputProbe: ProbeResult;
  wasHdr: boolean;
  // Which tone map path ran; null for SDR input.
  toneMapPath: ToneMapPath | null;
};

const capabilityCache = new Map<string, Promise<CapabilityReport>>();

function capabilitiesFor(ffmpegPath: string): Promise<CapabilityReport> {
  let cached = capabilityCache.get(ffmpegPath);
  if (!cached) {
    cached = getFfCapabilities(ffmpegPath);
    capabilityCache.set(ffmpegPath, cached);
    // Do not cache a failure.
    cached.catch(() => capabilityCache.delete(ffmpegPath));
  }
  return cached;
}

// Probe -> decide -> transcode. Writes `<outputPath>.partial` and renames it into place on
// success; on failure or abort the partial is deleted after ffmpeg has exited. The input
// file is only ever read (golden rule 6).
export async function normalize(
  inputPath: string,
  outputPath: string,
  options: NormalizeOptions = {},
): Promise<NormalizeResult> {
  const { onProgress, signal, toneMap = DEFAULT_TONE_MAP } = options;
  const ff = options.ffPaths ?? resolveDevFfPaths();
  const input = path.resolve(inputPath);
  const output = path.resolve(outputPath);
  if (input === output) {
    throw new Error("Refusing to normalize a file onto itself.");
  }

  const probe = await probeFile(ff.ffprobe, input);
  const toneMapPath = probe.isHdr
    ? chooseToneMapPath(await capabilitiesFor(ff.ffmpeg))
    : null;
  if (toneMapPath) {
    console.info(
      `[normalize] HDR (${probe.colorTransfer}) -> SDR via ${toneMapPath} ` +
        `(${toneMap.algorithm}, npl ${toneMap.npl}, desat ${toneMap.desat})`,
    );
  }

  const partial = `${output}.partial`;
  await mkdir(path.dirname(output), { recursive: true });
  const args = buildNormalizeArgs(probe, { input, output: partial, toneMap });
  const parser = createProgressParser(probe.duration);

  try {
    await runStreaming(ff.ffmpeg, args, {
      signal,
      onStdoutChunk: (chunk) => {
        for (const update of parser.push(chunk)) {
          onProgress?.(update.percent);
        }
      },
    });
    await rename(partial, output);
  } catch (error) {
    // runStreaming has already waited for the child to close.
    await rm(partial, { force: true });
    throw error;
  }

  const outputProbe = await probeFile(ff.ffprobe, output);
  return { probe, outputProbe, wasHdr: probe.isHdr, toneMapPath };
}
