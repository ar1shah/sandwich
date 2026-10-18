import { useState } from "react";
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
  const [failed, setFailed] = useState(false);
  return (
    <Modal
      title={brollTileLabel(media)}
      onClose={onClose}
      widthClass="max-w-xl"
    >
      {failed && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          This clip file is missing from the library. Delete it from the product
          page and import it again.
        </p>
      )}
      {video && !failed && (
        <video
          onError={() => setFailed(true)}
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
