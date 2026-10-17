// Render timing helpers. Pure.

// Milliseconds of renderMedia time per second of finished video.
export function msPerOutputSecond(
  renderMs: number,
  totalFrames: number,
  fps: number,
): number {
  const outputSeconds = totalFrames / fps;
  return outputSeconds > 0 ? renderMs / outputSeconds : 0;
}
