import { mediaUrl } from "../../../shared/mediaUrl";
import type { Media } from "../../../shared/library";

// Media file names carry the clip id and are never overwritten, so no cache-busting query
// is needed (unlike the product photo).
export function mediaThumbUrl(
  mediaBase: string | null,
  media: Pick<Media, "thumbPath">,
): string | null {
  return mediaBase && media.thumbPath
    ? mediaUrl(mediaBase, media.thumbPath)
    : null;
}

export function mediaVideoUrl(
  mediaBase: string | null,
  media: Pick<Media, "path">,
): string | null {
  return mediaBase ? mediaUrl(mediaBase, media.path) : null;
}

export function mediaFilmstripUrl(
  mediaBase: string | null,
  media: Pick<Media, "filmstripPath">,
): string | null {
  return mediaBase && media.filmstripPath
    ? mediaUrl(mediaBase, media.filmstripPath)
    : null;
}
