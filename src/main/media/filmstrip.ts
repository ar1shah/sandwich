import path from "node:path";
import { mkdir } from "node:fs/promises";
import {
  buildFilmstripFilter,
  filmstripLayout,
  type FilmstripLayout,
} from "../../shared/filmstripLayout";
import { resolveDevFfPaths, type FfPaths } from "./binaries";
import { runCapture } from "./run";

export type FilmstripResult = FilmstripLayout & { path: string };

// One-row sprite sheet for the trim UI. Pass the normalized working file with its probe
// (display size and duration decide the layout).
export async function makeFilmstrip(
  videoPath: string,
  jpgPath: string,
  clip: {
    duration: number;
    width: number;
    height: number;
    ffPaths?: FfPaths;
    signal?: AbortSignal;
  },
): Promise<FilmstripResult> {
  const ff = clip.ffPaths ?? resolveDevFfPaths();
  const layout = filmstripLayout(clip.duration, clip.width, clip.height);
  await mkdir(path.dirname(jpgPath), { recursive: true });
  await runCapture(
    ff.ffmpeg,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-i",
      videoPath,
      "-vf",
      buildFilmstripFilter(layout),
      "-frames:v",
      "1",
      "-q:v",
      "3",
      "-update",
      "1",
      jpgPath,
    ],
    { timeoutMs: 120_000, signal: clip.signal },
  );
  return { path: jpgPath, ...layout };
}
