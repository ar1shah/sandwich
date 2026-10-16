// Reads the pixel size of a JPEG from its start-of-frame marker. Pure.
export function jpegSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) {
      return null;
    }
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    // Markers without a length: TEM, RSTn, SOI, EOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2;
      continue;
    }
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      if (at + 8 >= bytes.length) {
        return null;
      }
      return {
        height: ((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0),
        width: ((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0),
      };
    }
    at += 2 + length;
  }
  return null;
}
