import type { Media } from "./library";

// One answer per requested path. `media` is the database row, `fileExists` the file on
// disk: a clip is only usable when both are there.
export type MediaPathCheck = {
  path: string;
  media: Media | null;
  fileExists: boolean;
};

export function isUsableMedia(check: MediaPathCheck): boolean {
  return check.media !== null && check.fileExists;
}
