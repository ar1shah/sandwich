import { describe, expect, it } from "vitest";
import { isFastStart, topLevelBoxOrder } from "../src/shared/mp4Boxes";

function box(type: string, payloadSize: number): number[] {
  const size = 8 + payloadSize;
  return [
    (size >>> 24) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 8) & 0xff,
    size & 0xff,
    ...Array.from(type).map((char) => char.charCodeAt(0)),
    ...new Array<number>(payloadSize).fill(0),
  ];
}

describe("topLevelBoxOrder", () => {
  it("lists boxes in file order", () => {
    const bytes = Uint8Array.from([
      ...box("ftyp", 12),
      ...box("moov", 40),
      ...box("mdat", 100),
    ]);
    expect(topLevelBoxOrder(bytes)).toEqual(["ftyp", "moov", "mdat"]);
    expect(isFastStart(topLevelBoxOrder(bytes))).toBe(true);
  });

  it("detects a moov atom after mdat (not faststart)", () => {
    const bytes = Uint8Array.from([
      ...box("ftyp", 12),
      ...box("mdat", 100),
      ...box("moov", 40),
    ]);
    const order = topLevelBoxOrder(bytes);
    expect(order).toEqual(["ftyp", "mdat", "moov"]);
    expect(isFastStart(order)).toBe(false);
  });

  it("stops on a truncated or malformed header", () => {
    expect(topLevelBoxOrder(Uint8Array.from([0, 0, 0]))).toEqual([]);
    expect(
      topLevelBoxOrder(Uint8Array.from([0, 0, 0, 4, 102, 114, 101, 101])),
    ).toEqual(["free"]);
  });

  it("returns false when either box is missing", () => {
    expect(isFastStart(["ftyp", "mdat"])).toBe(false);
    expect(isFastStart(["ftyp", "moov"])).toBe(false);
  });
});
