import { describe, expect, it } from "vitest";
import { jpegSize } from "../src/shared/jpegSize";

// SOI, APP0 (length 4), SOF0 (height 120, width 4080), EOI.
const sample = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08,
  0x00, 0x78, 0x0f, 0xf0, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
]);

describe("jpegSize", () => {
  it("reads width and height from SOF0, skipping other segments", () => {
    expect(jpegSize(sample)).toEqual({ width: 4080, height: 120 });
  });

  it("reads progressive SOF2 too", () => {
    const progressive = sample.slice();
    progressive[9] = 0xc2;
    expect(jpegSize(progressive)).toEqual({ width: 4080, height: 120 });
  });

  it("returns null for non-JPEG or truncated data", () => {
    expect(jpegSize(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(jpegSize(sample.slice(0, 10))).toBeNull();
    expect(jpegSize(new Uint8Array())).toBeNull();
  });

  it("ignores the DHT marker, which is not a frame header", () => {
    const withDht = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xc4,
      0x00,
      0x02,
      ...sample.slice(8),
    ]);
    expect(jpegSize(withDht)).toEqual({ width: 4080, height: 120 });
  });

  it("skips fill bytes and markers that carry no length", () => {
    const withFiller = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xff,
      0xff,
      0xd0,
      ...sample.slice(8),
    ]);
    expect(jpegSize(withFiller)).toEqual({ width: 4080, height: 120 });
  });

  it("returns null when a segment is not preceded by a marker byte", () => {
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00]))).toBeNull();
  });
});
