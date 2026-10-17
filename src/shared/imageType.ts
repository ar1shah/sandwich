// Image type from the first bytes of a file. Never trust File.type or the extension.
// Pure.

export type DetectedImageType = "jpeg" | "png" | "webp" | "heic";

function ascii(bytes: Uint8Array, from: number, length: number): string {
  let text = "";
  for (let i = from; i < from + length && i < bytes.length; i++) {
    text += String.fromCharCode(bytes[i] ?? 0);
  }
  return text;
}

// HEIC/HEIF brands that phones write. Detected only to give a helpful message: the bundled
// ffmpeg cannot decode them.
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
]);

export function detectImageType(bytes: Uint8Array): DetectedImageType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "webp";
  }
  if (ascii(bytes, 4, 4) === "ftyp" && HEIF_BRANDS.has(ascii(bytes, 8, 4))) {
    return "heic";
  }
  return null;
}
