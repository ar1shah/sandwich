import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PRODUCT_IMAGE_MAX_EDGE } from "../../shared/products";
import { resolveDevFfPaths, type FfPaths } from "./binaries";
import { runCapture } from "./run";

// Longest edge at most PRODUCT_IMAGE_MAX_EDGE (never upscaled), as a JPEG.
// - Transparency is flattened onto white: a white copy of the image goes underneath, so a
//   transparent PNG does not come out black.
// - EXIF orientation is applied by ffmpeg's auto-rotate when it decodes the still (checked
//   by tests/productImage.test.ts; ffmpeg 6.0 does it).
const MAX = PRODUCT_IMAGE_MAX_EDGE;
const FILTER =
  "[0:v]split=2[fg][bg];" +
  "[bg]drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill[white];" +
  "[white][fg]overlay=format=auto," +
  `scale=w=min(${MAX}\\,iw):h=min(${MAX}\\,ih):force_original_aspect_ratio=decrease,` +
  "format=yuvj420p";

export async function processProductImage(
  inputFile: string,
  outJpg: string,
  { ffPaths, signal }: { ffPaths?: FfPaths; signal?: AbortSignal } = {},
): Promise<void> {
  const ff = ffPaths ?? resolveDevFfPaths();
  await mkdir(path.dirname(outJpg), { recursive: true });
  await runCapture(
    ff.ffmpeg,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-i",
      inputFile,
      "-filter_complex",
      FILTER,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      "-update",
      "1",
      outJpg,
    ],
    { signal, timeoutMs: 30_000 },
  );
}
