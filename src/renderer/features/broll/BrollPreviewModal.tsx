import { Modal } from "../../components/Modal";
import { formatDuration } from "../../../shared/formatDuration";
import type { Media } from "../../../shared/library";
import { brollTileLabel } from "./BrollTile";
import { mediaVideoUrl } from "../media/mediaUrls";

// The larger preview. object-contain so a horizontal clip is shown whole; the tile crops it
// to 9:16 like the finished video will.
export const BrollPreviewModal: React.FC<{
  media: Media;
  mediaBase: string | null;
  onClose: () => void;
}> = ({ media, mediaBase, onClose }) => {
  const video = mediaVideoUrl(mediaBase, media);
  return (
    <Modal
      title={brollTileLabel(media)}
      onClose={onClose}
      widthClass="max-w-xl"
    >
      {video && (
        <video
          src={video}
          controls
          autoPlay
          loop
          playsInline
          aria-label="B-roll preview"
          className="mt-4 max-h-[65vh] w-full rounded-lg bg-black object-contain"
        />
      )}
      <p className="mt-3 text-xs text-app-muted">
        {formatDuration(media.duration)} &middot; {media.width}x{media.height}
        {media.wasHdr ? " · HDR source, tone mapped" : ""}
      </p>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="rounded-md border border-edge px-4 py-2 text-sm hover:bg-white/5"
        >
          Close
        </button>
      </div>
    </Modal>
  );
};
