import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { jobTmpDir, ugcClipPaths } from "../../shared/importPaths";
import { fileBaseName, type JobResult } from "../../shared/jobs";
import type { JobRunContext } from "../../shared/jobScheduler";
import type { ProbeResult } from "../../shared/probeParse";
import type { Repos } from "../db/repos";
import { toAbsolute } from "../db/libraryPaths";
import { resolveDevFfPaths, type FfPaths } from "../media/binaries";
import type { FilmstripResult } from "../media/filmstrip";
import { makeFilmstrip } from "../media/filmstrip";
import { normalize, type NormalizeResult } from "../media/normalize";
import { AbortError } from "../media/run";
import { makeThumbnail } from "../media/thumbs";

// The ffmpeg-backed steps, injectable so tests can fake them.
export type ImportSteps = {
  normalize: (
    input: string,
    output: string,
    options: { onProgress: (percent: number) => void; signal: AbortSignal },
  ) => Promise<
    Pick<NormalizeResult, "wasHdr"> & {
      probe: ProbeResult;
      outputProbe: ProbeResult;
    }
  >;
  thumbnail: (
    video: string,
    jpg: string,
    options: { duration: number; signal: AbortSignal },
  ) => Promise<void>;
  filmstrip: (
    video: string,
    jpg: string,
    options: {
      duration: number;
      width: number;
      height: number;
      signal: AbortSignal;
    },
  ) => Promise<Pick<FilmstripResult, "path">>;
};

export function createFfmpegSteps(ffPaths?: FfPaths): ImportSteps {
  const ff = ffPaths ?? resolveDevFfPaths();
  return {
    normalize: (input, output, options) =>
      normalize(input, output, { ...options, ffPaths: ff }),
    thumbnail: (video, jpg, options) =>
      makeThumbnail(video, jpg, { ...options, ffPaths: ff }),
    filmstrip: (video, jpg, options) =>
      makeFilmstrip(video, jpg, { ...options, ffPaths: ff }),
  };
}

export type ImportClipDeps = {
  root: string;
  repos: Pick<Repos, "media">;
  steps: ImportSteps;
  // Local clock; its month names the clips/<yyyy-mm> folder.
  now: () => Date;
  newId: () => string;
};

// Progress weights: normalize is nearly all of the time.
const NORMALIZE_END = 90;
const THUMBNAIL_END = 95;

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new AbortError();
  }
}

// Import one UGC clip: normalize -> thumbnail -> filmstrip -> media row.
//
// The original is only ever read (golden rule 6): ffmpeg opens it read-only and nothing is
// copied first. Every output is built inside cache/tmp/<jobId>/ and renamed into its final
// place only when all three exist; the row is inserted last. So a crash leaves nothing but
// cache/tmp (swept on the next open), and a row never points at a missing file. The one
// remaining gap is a crash between the renames and the insert, which leaves orphan files
// and no row (DECISIONS #29).
export async function importClip(
  originalPath: string,
  context: Pick<JobRunContext, "jobId" | "signal" | "setProgress">,
  deps: ImportClipDeps,
): Promise<JobResult> {
  const { jobId, signal, setProgress } = context;
  const { root, repos, steps } = deps;
  const clipId = deps.newId();
  const final = ugcClipPaths(clipId, deps.now());

  const tmpDir = toAbsolute(root, jobTmpDir(jobId));
  const tmp = {
    video: path.join(tmpDir, "clip.mp4"),
    thumb: path.join(tmpDir, "clip.jpg"),
    filmstrip: path.join(tmpDir, "filmstrip.jpg"),
  };
  const target = {
    video: toAbsolute(root, final.video),
    thumb: toAbsolute(root, final.thumb),
    filmstrip: toAbsolute(root, final.filmstrip),
  };
  // Files already renamed into the library; removed again if anything after fails.
  const moved: string[] = [];
  let succeeded = false;

  try {
    await mkdir(tmpDir, { recursive: true });
    setProgress(0, "Converting");

    const result = await steps.normalize(originalPath, tmp.video, {
      signal,
      onProgress: (percent) =>
        setProgress((percent / 100) * NORMALIZE_END, "Converting"),
    });
    throwIfAborted(signal);
    const {
      duration,
      displayWidth: width,
      displayHeight: height,
    } = result.outputProbe;

    setProgress(NORMALIZE_END, "Thumbnail");
    await steps.thumbnail(tmp.video, tmp.thumb, { duration, signal });
    throwIfAborted(signal);

    setProgress(THUMBNAIL_END, "Filmstrip");
    await steps.filmstrip(tmp.video, tmp.filmstrip, {
      duration,
      width,
      height,
      signal,
    });
    throwIfAborted(signal);

    for (const kind of ["video", "thumb", "filmstrip"] as const) {
      await mkdir(path.dirname(target[kind]), { recursive: true });
      await rename(tmp[kind], target[kind]);
      moved.push(target[kind]);
    }

    const media = repos.media.create({
      id: clipId,
      kind: "ugc",
      path: final.video,
      thumbPath: final.thumb,
      filmstripPath: final.filmstrip,
      originalName: fileBaseName(originalPath),
      duration,
      width,
      height,
      recordedAt: result.probe.recordedAt,
      wasHdr: result.wasHdr,
    });
    succeeded = true;
    return { mediaId: media.id };
  } finally {
    if (!succeeded) {
      await Promise.all(moved.map((file) => rm(file, { force: true })));
    }
    await rm(tmpDir, { recursive: true, force: true });
  }
}
