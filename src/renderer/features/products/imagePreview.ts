// Previews a picked photo in the form. The page's CSP allows data: images but not blob:, so
// the file is decoded, scaled down on a canvas and shown as a small data URL. If the browser
// cannot decode it (HEIC, a renamed file), the caller shows the "use a JPG, PNG or WebP" error.
const PREVIEW_EDGE = 480;

export async function readImagePreview(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      PREVIEW_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("No canvas.");
    }
    // Transparent PNGs are saved on white, so preview them on white too.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}
