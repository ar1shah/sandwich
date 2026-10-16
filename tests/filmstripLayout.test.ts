import { describe, expect, it } from "vitest";
import {
  buildFilmstripFilter,
  filmstripLayout,
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
