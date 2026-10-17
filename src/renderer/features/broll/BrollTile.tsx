import { useEffect, useState } from "react";
import { formatDuration } from "../../../shared/formatDuration";
import type { Media } from "../../../shared/library";
import { mediaThumbUrl, mediaVideoUrl } from "../media/mediaUrls";

// Wait this long before loading the preview, so sweeping the mouse across the grid does not
// start a decoder per tile.
const HOVER_DELAY_MS = 120;

export function brollTileLabel(media: Pick<Media, "originalName">): string {
  return media.originalName ?? "b-roll clip";
}

type BrollTileProps = {
  media: Media;
  mediaBase: string | null;
  onSelect: () => void;
  // Delete button that appears on hover or focus. Omit in pickers.
  onDelete?: () => void;
  // Picker mode: option semantics, and the keyboard cursor also plays the preview.
  option?: { id: string; active: boolean };
};

// A 9:16 tile: thumbnail, duration badge, and a muted looping preview while hovered. The
// <video> only exists while hovered or highlighted, which keeps the number of decoders low.
export const BrollTile: React.FC<BrollTileProps> = ({
  media,
  mediaBase,
  onSelect,
  onDelete,
  option,
}) => {
  const [hovered, setHovered] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const thumb = mediaThumbUrl(mediaBase, media);
  const video = mediaVideoUrl(mediaBase, media);
  const preview = hovered || option?.active === true;

  useEffect(() => {
    if (!preview) {
      setWanted(false);
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setWanted(true), HOVER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [preview]);

  return (
    <li
      id={option?.id}
      role={option ? "option" : undefined}
      aria-selected={option ? option.active : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={
        "group relative overflow-hidden rounded-xl border bg-panel transition-colors " +
        (option?.active
          ? "border-brand ring-2 ring-brand/60"
          : "border-edge hover:border-white/20")
      }
    >
      <button
        type="button"
        onClick={onSelect}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        tabIndex={option ? -1 : undefined}
        aria-label={option ? undefined : `Preview ${brollTileLabel(media)}`}
        className="relative block aspect-[9/16] w-full overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {thumb && (
          <img
            src={thumb}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {wanted && video && (
          <video
            src={video}
            muted
            loop
            autoPlay
            playsInline
            preload="auto"
            aria-hidden="true"
            onPlaying={() => setPlaying(true)}
            // Fades in once frames are moving, so the thumbnail never blinks to black.
            className={
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-150 " +
              (playing ? "opacity-100" : "opacity-0")
            }
          />
        )}
        <span
          data-testid="broll-duration"
          className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-xs tabular-nums text-white"
        >
          {formatDuration(media.duration)}
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${brollTileLabel(media)}`}
          className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs text-red-300 opacity-0 transition-opacity hover:bg-black focus:opacity-100 group-hover:opacity-100"
        >
          Delete
        </button>
      )}
    </li>
  );
};

export const BROLL_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4";
