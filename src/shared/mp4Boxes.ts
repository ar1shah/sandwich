// Walks the top-level boxes of an MP4/MOV so the verify step can check faststart
// (moov before mdat). Pure: operates on bytes, no fs.

export function topLevelBoxOrder(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const order: string[] = [];
  let offset = 0;

  while (offset + 8 <= bytes.byteLength) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    order.push(type);

    if (size === 1) {
      // 64-bit largesize follows the type.
      if (offset + 16 > bytes.byteLength) {
        break;
      }
      size = Number(view.getBigUint64(offset + 8));
    } else if (size === 0) {
      break; // box runs to the end of the file
    }
    if (size < 8) {
      break; // malformed
    }
    offset += size;
  }
  return order;
}

export function isFastStart(order: readonly string[]): boolean {
  const moov = order.indexOf("moov");
  const mdat = order.indexOf("mdat");
  return moov !== -1 && mdat !== -1 && moov < mdat;
}
