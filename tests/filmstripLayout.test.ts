import { describe, expect, it } from "vitest";
import {
  buildFilmstripFilter,
  filmstripLayout,
  filmstripTiles,
  thumbSeekTime,
} from "../src/shared/filmstripLayout";

describe("filmstripLayout", () => {
  it("takes one frame per second, rounding up", () => {
    expect(filmstripLayout(8, 1080, 1920)).toMatchObject({
      interval: 1,
      frameCount: 8,
    });
    expect(filmstripLayout(6.35, 1080, 1920).frameCount).toBe(7);
    expect(filmstripLayout(1, 1080, 1920).frameCount).toBe(1);
  });

  it("always has at least one frame", () => {
    expect(filmstripLayout(0.2, 1080, 1920).frameCount).toBe(1);
  });

  it("caps at 60 frames by stretching the interval", () => {
    const layout = filmstripLayout(120, 1080, 1920);
    expect(layout.frameCount).toBe(60);
    expect(layout.interval).toBe(2);
    expect(filmstripLayout(60, 1080, 1920).frameCount).toBe(60);
  });

  it("computes an even frame width from the aspect ratio at 120 px tall", () => {
    expect(filmstripLayout(5, 1080, 1920)).toMatchObject({
      frameWidth: 68,
      frameHeight: 120,
    });
    expect(filmstripLayout(5, 1920, 1080).frameWidth).toBe(213 + 1);
    expect(filmstripLayout(5, 884, 1920).frameWidth % 2).toBe(0);
  });
});

describe("buildFilmstripFilter", () => {
  it("samples, scales to an explicit width and tiles into one row", () => {
    const filter = buildFilmstripFilter(filmstripLayout(8, 1080, 1920));
    expect(filter).toBe("fps=1/1,scale=68:120,tile=8x1");
  });

  it("uses a fractional rate for long clips", () => {
    expect(buildFilmstripFilter(filmstripLayout(120, 1080, 1920))).toBe(
      "fps=1/2,scale=68:120,tile=60x1",
    );
  });
});

describe("thumbSeekTime", () => {
  it("is 10% of the duration", () => {
    expect(thumbSeekTime(10)).toBe(1);
    expect(thumbSeekTime(0)).toBe(0);
  });
});

describe("filmstripTiles", () => {
  // 1080x1920 clip: frames are 68x120; a 60 px tall track makes 34 px cells.
  const HEIGHT = 60;
  const CELL = 34;

  function indexOf(offsetX: number): number {
    return Math.round(-offsetX / CELL);
  }

  it("lays natural-aspect cells across the track and clips the last one", () => {
    const layout = filmstripLayout(8, 1080, 1920);
    const result = filmstripTiles(layout, 8, 300, HEIGHT);
    expect(result.tiles).toHaveLength(9);
    expect(result.tiles[0]).toMatchObject({ left: 0, width: CELL });
    expect(result.tiles[8].left).toBe(8 * CELL);
    expect(result.tiles[8].width).toBe(300 - 8 * CELL);
    expect(result.spriteWidth).toBe(8 * CELL);
    expect(result.spriteHeight).toBe(HEIGHT);
  });

  it("maps cells to the sprite frame nearest their time (8 s clip)", () => {
    const layout = filmstripLayout(8, 1080, 1920);
    const { tiles } = filmstripTiles(layout, 8, 272, HEIGHT);
    // 272 px = 8 cells of one second each: cell k is centred on k + 0.5 s.
    expect(tiles.map((tile) => indexOf(tile.offsetX))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 7,
    ]);
  });

  it("does not stretch the clip over the whole sprite (3.2 s clip)", () => {
    // The sprite has 4 frames (0 to 4 s) but the clip ends at 3.2 s.
    const layout = filmstripLayout(3.2, 1080, 1920);
    expect(layout.frameCount).toBe(4);
    const { tiles } = filmstripTiles(layout, 3.2, 3.2 * CELL, HEIGHT);
    expect(tiles).toHaveLength(4);
    // Cell k is centred on about k + 0.5 s (the last on 3.1 s). The first sits on a
    // rounding boundary, so only require frame 0 or 1; the rest are fixed.
    const indexes = tiles.map((tile) => indexOf(tile.offsetX));
    expect([0, 1]).toContain(indexes[0]);
    expect(indexes.slice(1)).toEqual([2, 3, 3]);
    // The last cell is only a fifth of a cell wide.
    expect(tiles[3].width).toBeCloseTo(0.2 * CELL, 6);
  });

  it("samples a 45 s clip across the whole sprite", () => {
    const layout = filmstripLayout(45, 1080, 1920);
    expect(layout.frameCount).toBe(45);
    const { tiles } = filmstripTiles(layout, 45, 600, HEIGHT);
    const indexes = tiles.map((tile) => indexOf(tile.offsetX));
    expect(indexes[0]).toBe(1);
    expect(indexes.at(-1)).toBeGreaterThanOrEqual(43);
    expect(indexes.at(-1)).toBeLessThanOrEqual(44);
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
  });

  it("uses the stretched interval for clips over 60 s", () => {
    const layout = filmstripLayout(120, 1080, 1920);
    expect(layout).toMatchObject({ interval: 2, frameCount: 60 });
    const { tiles } = filmstripTiles(layout, 120, 1020, HEIGHT);
    expect(tiles).toHaveLength(30);
    // Cell 0 is centred on 2 s = frame 1; the last on 118 s = frame 59.
    expect(indexOf(tiles[0].offsetX)).toBe(1);
    expect(indexOf(tiles[29].offsetX)).toBe(59);
  });

  it("never points past the sprite", () => {
    const layout = filmstripLayout(1, 1080, 1920);
    const { tiles } = filmstripTiles(layout, 1, 500, HEIGHT);
    for (const tile of tiles) {
      expect(indexOf(tile.offsetX)).toBe(0);
    }
  });

  it("returns no cells for an empty track", () => {
    const layout = filmstripLayout(8, 1080, 1920);
    expect(filmstripTiles(layout, 8, 0, HEIGHT).tiles).toEqual([]);
    expect(filmstripTiles(layout, 8, 300, 0).tiles).toEqual([]);
    expect(filmstripTiles(layout, 0, 300, HEIGHT).tiles).toEqual([]);
  });

  it("works for a landscape clip", () => {
    const layout = filmstripLayout(4, 1920, 1080);
    const { tiles, spriteWidth } = filmstripTiles(layout, 4, 400, 60);
    const cell = (60 * layout.frameWidth) / layout.frameHeight;
    expect(tiles[0].width).toBeCloseTo(cell, 6);
    expect(spriteWidth).toBeCloseTo(4 * cell, 6);
  });
});
