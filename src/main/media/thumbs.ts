import path from "node:path";
import { mkdir } from "node:fs/promises";
import { THUMBNAIL_WIDTH, thumbSeekTime } from "../../shared/filmstripLayout";
import { resolveDevFfPaths, type FfPaths } from "./binaries";
import { runCapture } from "./run";

// 360 px wide jpg from 10% into the clip. Pass the normalized working file, not the
// original, so the frame is already SDR and upright.
export async function makeThumbnail(
  videoPath: string,
  jpgPath: string,
  {
    duration,
    ffPaths,
    signal,
  }: { duration: number; ffPaths?: FfPaths; signal?: AbortSignal },
): Promise<void> {
  const ff = ffPaths ?? resolveDevFfPaths();
  await mkdir(path.dirname(jpgPath), { recursive: true });
  await runCapture(
    ff.ffmpeg,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-ss",
      thumbSeekTime(duration).toFixed(3),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      `scale=${THUMBNAIL_WIDTH}:-2`,
      "-q:v",
      "3",
      "-update",
      "1",
      jpgPath,
    ],
    { signal },
  );
}
