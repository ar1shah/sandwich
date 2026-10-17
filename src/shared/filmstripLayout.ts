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

export type FilmstripTile = {
  left: number; // px from the left of the track
  width: number; // visible px (the last cell is clipped by the track)
  offsetX: number; // px shift of the shared sprite inside the cell (<= 0)
};

export type FilmstripTiles = {
  tiles: FilmstripTile[];
  // Draw the sprite at this size in every cell (background-size).
  spriteWidth: number;
  spriteHeight: number;
};

// How the trim track shows the sprite. The sprite has ceil(duration / interval) frames, so
// it covers up to a whole interval more than the clip and its frames are not stretched to
// the track. Instead the track is cut into cells of a frame's natural aspect; each cell
// shows the sprite frame sampled nearest the time under the cell's visible centre.
export function filmstripTiles(
  layout: FilmstripLayout,
  clipDuration: number,
  trackWidth: number,
  trackHeight: number,
): FilmstripTiles {
  const cell = (trackHeight * layout.frameWidth) / layout.frameHeight;
  const spriteWidth = layout.frameCount * cell;
  if (!(trackWidth > 0) || !(trackHeight > 0) || !(clipDuration > 0)) {
    return { tiles: [], spriteWidth, spriteHeight: trackHeight };
  }
  const count = Math.ceil(trackWidth / cell - 1e-9);
  const tiles: FilmstripTile[] = [];
  for (let i = 0; i < count; i++) {
    const left = i * cell;
    const width = Math.min(cell, trackWidth - left);
    const centerTime = ((left + width / 2) / trackWidth) * clipDuration;
    // Frame k was sampled at k * interval.
    const index = Math.min(
      layout.frameCount - 1,
      Math.max(0, Math.round(centerTime / layout.interval)),
    );
    tiles.push({ left, width, offsetX: -index * cell });
  }
  return { tiles, spriteWidth, spriteHeight: trackHeight };
}
