// Layout math for the trim filmstrip (ARCHITECTURE section 6): one frame per second,
// at most 60 frames, 120 px tall, tiled into a single row. Pure.

export const FILMSTRIP_MAX_FRAMES = 60;
export const FILMSTRIP_FRAME_HEIGHT = 120;
export const THUMBNAIL_WIDTH = 360;

export type FilmstripLayout = {
  interval: number; // seconds between sampled frames
  frameCount: number;
  frameWidth: number; // even, from the clip aspect ratio
  frameHeight: number;
};

export function filmstripLayout(
  duration: number,
  width: number,
  height: number,
): FilmstripLayout {
  // Clips over 60 s stretch the interval so the cap still spans the whole clip.
  const interval = Math.max(1, duration / FILMSTRIP_MAX_FRAMES);
  const frameCount = Math.min(
    FILMSTRIP_MAX_FRAMES,
    Math.max(1, Math.ceil(duration / interval)),
  );
  const frameWidth = Math.max(
    2,
    2 * Math.round((FILMSTRIP_FRAME_HEIGHT * (width / height)) / 2),
  );
  return {
    interval,
    frameCount,
    frameWidth,
    frameHeight: FILMSTRIP_FRAME_HEIGHT,
  };
}

// Explicit scale width (not -2) so the sprite math is exact: width == frameCount * frameWidth.
export function buildFilmstripFilter(layout: FilmstripLayout): string {
  return [
    `fps=1/${layout.interval}`,
    `scale=${layout.frameWidth}:${layout.frameHeight}`,
    `tile=${layout.frameCount}x1`,
  ].join(",");
}

// The thumbnail is taken 10% into the clip.
export function thumbSeekTime(duration: number): number {
  return Math.max(0, duration * 0.1);
}
