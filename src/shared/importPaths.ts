// Where an imported clip lives inside the library (ARCHITECTURE section 3). Every path
// is library-relative with forward slashes, as stored in the database. Pure.

// Staging folder for one import job. Every output is built here first, then renamed into
// place, so a crash leaves only this folder (swept on the next open).
export const TMP_DIR = "cache/tmp";

export function jobTmpDir(jobId: string): string {
  return `${TMP_DIR}/${jobId}`;
}

// yyyy-mm of the LOCAL date `now`: the import date from the injected clock, not the date
// the clip was recorded.
export function importMonthFolder(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

export type MediaFilePaths = {
  video: string;
  thumb: string;
  filmstrip: string;
};

export function ugcClipPaths(clipId: string, now: Date): MediaFilePaths {
  const base = `clips/${importMonthFolder(now)}/${clipId}`;
  return {
    video: `${base}.mp4`,
    thumb: `${base}.jpg`,
    filmstrip: `cache/filmstrips/${clipId}.jpg`,
  };
}

export function brollPaths(productId: string, brollId: string): MediaFilePaths {
  const base = `products/${productId}/broll/${brollId}`;
  return {
    video: `${base}.mp4`,
    thumb: `${base}.jpg`,
    filmstrip: `cache/filmstrips/${brollId}.jpg`,
  };
}

// The photo shown on a product card (ARCHITECTURE section 3). Always this one name: an
// edit replaces the file, and the renderer cache-busts with the row's updated_at.
export function productImagePath(productId: string): string {
  return `products/${productId}/image.jpg`;
}

export function productDir(productId: string): string {
  return `products/${productId}`;
}
