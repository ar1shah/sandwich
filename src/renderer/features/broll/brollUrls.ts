import { mediaUrl } from "../../../shared/mediaUrl";
import type { Media } from "../../../shared/library";

// b-roll file names carry the clip id and are never overwritten, so no cache-busting query
// is needed (unlike the product photo).
export function brollThumbUrl(
  mediaBase: string | null,
  media: Pick<Media, "thumbPath">,
): string | null {
  return mediaBase && media.thumbPath
    ? mediaUrl(mediaBase, media.thumbPath)
    : null;
}

export function brollVideoUrl(
  mediaBase: string | null,
  media: Pick<Media, "path">,
): string | null {
  return mediaBase ? mediaUrl(mediaBase, media.path) : null;
}
