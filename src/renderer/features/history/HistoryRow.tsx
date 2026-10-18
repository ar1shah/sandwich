import { formatDuration } from "../../../shared/formatDuration";
import {
  historyBadge,
  historyTitle,
  type HistoryBadge,
  type VideoSummary,
} from "../../../shared/history";
import { showInFileManagerLabel } from "../../../shared/platform";
import type { ExportFileState } from "../../../shared/videos";
import { Thumb } from "../../components/Thumb";

const SECONDARY =
  "rounded-md border border-edge px-3 py-1.5 text-sm transition-colors hover:bg-white/5";

const BADGE_CLASS: Record<HistoryBadge, string> = {
  Draft: "bg-white/10 text-app-muted",
  Exported: "bg-emerald-500/15 text-emerald-300",
  Failed: "bg-red-500/15 text-red-300",
  "File missing": "bg-amber-500/15 text-amber-300",
};

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

type HistoryRowProps = {
  video: VideoSummary;
  // Full URL of the Before clip's thumbnail, or null.
  thumbUrl: string | null;
  fileState: ExportFileState | undefined;
  platform: string;
  onOpen: () => void;
  onReveal: () => void;
  onDelete: () => void;
};

export const HistoryRow: React.FC<HistoryRowProps> = ({
  video,
  thumbUrl,
  fileState,
  platform,
  onOpen,
  onReveal,
  onDelete,
}) => {
  const badge = historyBadge(video, fileState);
  const exported = video.status === "exported";
  const details = video.readable
    ? [
        exported ? null : `${video.filledSlots} of 3 clips`,
        formatDuration(video.duration),
        when(video.updatedAt),
      ]
    : [when(video.updatedAt)];

  return (
    <li
      data-testid="history-row"
      data-status={video.status}
      data-badge={badge}
      className="flex items-center gap-3 rounded-xl border border-edge bg-panel px-4 py-3"
    >
      <div className="relative aspect-[9/16] w-10 shrink-0 overflow-hidden rounded bg-app">
        <Thumb
          src={thumbUrl}
          className="h-full w-full object-cover"
          fallback={
            <span
              data-testid="history-no-preview"
              className="absolute inset-0 grid place-items-center px-0.5 text-center text-[9px] leading-tight text-app-dim"
            >
              No preview
            </span>
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={historyTitle(video)}>
          {historyTitle(video)}
        </p>
        <p className="text-xs text-app-muted">
          {details.filter((part) => part !== null).join(" · ")}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${BADGE_CLASS[badge]}`}
      >
        {badge}
      </span>
      {!exported && video.readable && (
        <button type="button" className={SECONDARY} onClick={onOpen}>
          Open
        </button>
      )}
      {exported && fileState !== "missing" && (
        <button type="button" className={SECONDARY} onClick={onReveal}>
          {showInFileManagerLabel(platform)}
        </button>
      )}
      <button type="button" className={SECONDARY} onClick={onDelete}>
        Delete
      </button>
    </li>
  );
};
