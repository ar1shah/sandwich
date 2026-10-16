// Small numeric helpers for comparing tone map variants. Pure.

export type RgbStats = { y: number; r: number; g: number; b: number };

// Mean R, G, B and BT.709 luma (all 0..255) over packed rgb24 bytes (any number of frames).
export function meanRgbStats(rgb24: Uint8Array): RgbStats {
  const pixels = Math.floor(rgb24.length / 3);
  if (pixels === 0) {
    return { y: 0, r: 0, g: 0, b: 0 };
  }
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < pixels; i += 1) {
    r += rgb24[i * 3] ?? 0;
    g += rgb24[i * 3 + 1] ?? 0;
    b += rgb24[i * 3 + 2] ?? 0;
  }
  const mean = { r: r / pixels, g: g / pixels, b: b / pixels };
  return {
    ...mean,
    y: 0.2126 * mean.r + 0.7152 * mean.g + 0.0722 * mean.b,
  };
}

// ffmpeg's ssim filter ends with "SSIM Y:0.98 (17.1 dB) U:... V:... All:0.97 (15.2 dB)".
export function parseSsimAll(ffmpegStderr: string): number | null {
  const matches = [...ffmpegStderr.matchAll(/All:(\d+(?:\.\d+)?)/g)];
  const last = matches.at(-1)?.[1];
  return last === undefined ? null : Number(last);
}
