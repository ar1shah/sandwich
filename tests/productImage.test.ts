import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveDevFfPaths } from "../src/main/media/binaries";
import { processProductImage } from "../src/main/media/productImage";
import { runCapture, runCaptureBuffer } from "../src/main/media/run";
import { jpegSize } from "../src/shared/jpegSize";
import { PRODUCT_IMAGE_MAX_EDGE } from "../src/shared/products";
import { makeTempDir } from "./helpers/db";

const ff = resolveDevFfPaths();
const hasFfmpeg = existsSync(ff.ffmpeg);

// Real ffmpeg. Run `npm run ffmpeg:fetch` if this suite is skipped.
describe.skipIf(!hasFfmpeg)("processProductImage (real ffmpeg)", () => {
  // helpers/db removes temp dirs after every test, so each test gets its own.
  let dir = "";
  beforeEach(() => {
    dir = makeTempDir("sandwich-product-image-");
  });

  async function makeInput(name: string, lavfi: string, extra: string[] = []) {
    const file = path.join(dir, name);
    await runCapture(ff.ffmpeg, [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      lavfi,
      ...extra,
      "-frames:v",
      "1",
      file,
    ]);
    return file;
  }

  async function run(input: string, name = "out.jpg") {
    const out = path.join(dir, name);
    await processProductImage(input, out, { ffPaths: ff });
    const bytes = readFileSync(out);
    return { out, bytes, size: jpegSize(bytes) };
  }

  // RGB of the pixel at (x, y) of an image file.
  async function pixel(
    file: string,
    x: number,
    y: number,
    format: "rgb24" | "rgba" = "rgb24",
  ) {
    const { stdout } = await runCaptureBuffer(ff.ffmpeg, [
      "-loglevel",
      "error",
      "-i",
      file,
      "-vf",
      `format=${format},crop=1:1:${x}:${y}`,
      "-f",
      "rawvideo",
      "-",
    ]);
    return [stdout[0] ?? -1, stdout[1] ?? -1, stdout[2] ?? -1, stdout[3] ?? -1];
  }

  it("shrinks a large landscape image to a long edge of 800", async () => {
    const input = await makeInput("big.png", "testsrc=s=1200x900");
    const { size } = await run(input);
    expect(size).toEqual({ width: PRODUCT_IMAGE_MAX_EDGE, height: 600 });
  });

  it("shrinks a large portrait image to a long edge of 800", async () => {
    const input = await makeInput("tall.png", "testsrc=s=900x1500");
    const { size } = await run(input);
    expect(size).toEqual({ width: 480, height: PRODUCT_IMAGE_MAX_EDGE });
  });

  it("does not upscale a small image", async () => {
    const input = await makeInput("small.png", "testsrc=s=200x100");
    const { size } = await run(input);
    expect(size).toEqual({ width: 200, height: 100 });
  });

  it("flattens transparency onto white instead of black", async () => {
    // Fully transparent black. Check the input really is transparent first, so this test
    // cannot pass because the fixture was opaque.
    const input = await makeInput("clear.png", "color=c=black:s=100x80", [
      "-vf",
      "format=rgba,geq=r=0:g=0:b=0:a=0",
    ]);
    expect((await pixel(input, 2, 2, "rgba"))[3]).toBe(0);

    const { out } = await run(input);
    const [r, g, b] = await pixel(out, 2, 2);
    expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(250);
  });

  it("keeps opaque pixels as they are", async () => {
    const input = await makeInput("red.png", "color=c=red:s=100x80");
    const { out } = await run(input);
    const [r, g, b] = await pixel(out, 50, 40);
    expect(r).toBeGreaterThan(220);
    expect(g).toBeLessThan(40);
    expect(b).toBeLessThan(40);
  });

  it("applies EXIF orientation 6 (landscape pixels come out portrait)", async () => {
    const plain = await makeInput("land.jpg", "testsrc=s=120x80");
    expect(jpegSize(readFileSync(plain))).toEqual({ width: 120, height: 80 });
    const rotated = path.join(dir, "land6.jpg");
    writeFileSync(rotated, withExifOrientation(readFileSync(plain), 6));

    const { size } = await run(rotated);
    expect(size).toEqual({ width: 80, height: 120 });
  });

  it("leaves an image without EXIF orientation upright", async () => {
    const plain = await makeInput("land2.jpg", "testsrc=s=120x80");
    const { size } = await run(plain);
    expect(size).toEqual({ width: 120, height: 80 });
  });

  it("fails on something that is not an image", async () => {
    const junk = path.join(dir, "junk.png");
    writeFileSync(junk, "not an image at all");
    await expect(run(junk, "junk-out.jpg")).rejects.toThrow();
  });
});

// Inserts an EXIF APP1 segment holding only the Orientation tag right after the JPEG SOI.
function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  // Big-endian TIFF header, one IFD entry: tag 0x0112, type SHORT, count 1, value.
  const tiff = Buffer.from([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = body.length + 2;
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1, length >> 8, length & 0xff]),
    body,
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}
