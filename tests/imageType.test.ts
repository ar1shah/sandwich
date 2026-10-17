import { describe, expect, it } from "vitest";
import { detectImageType } from "../src/shared/imageType";

function bytes(...parts: (number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      for (const char of part) {
        out.push(char.charCodeAt(0));
      }
    } else {
      out.push(...part);
    }
  }
  return new Uint8Array(out);
}

describe("detectImageType", () => {
  it("detects JPEG, PNG and WebP by magic bytes", () => {
    expect(detectImageType(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("jpeg");
    expect(
      detectImageType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("png");
    expect(detectImageType(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 "))).toBe(
      "webp",
    );
  });

  it("detects HEIC and HEIF brands", () => {
    expect(detectImageType(bytes([0, 0, 0, 0x18], "ftypheic"))).toBe("heic");
    expect(detectImageType(bytes([0, 0, 0, 0x18], "ftypmif1"))).toBe("heic");
  });

  it("does not trust a RIFF container that is not WebP", () => {
    expect(detectImageType(bytes("RIFF", [1, 2, 3, 4], "WAVEfmt "))).toBeNull();
  });

  it("does not treat an MP4 as HEIC", () => {
    expect(detectImageType(bytes([0, 0, 0, 0x18], "ftypisom"))).toBeNull();
  });

  it("returns null for anything else, including tiny and empty input", () => {
    expect(detectImageType(bytes("GIF89a"))).toBeNull();
    expect(detectImageType(bytes("<svg xmlns="))).toBeNull();
    expect(detectImageType(new Uint8Array(0))).toBeNull();
    expect(detectImageType(bytes([0xff, 0xd8]))).toBeNull();
  });
});
