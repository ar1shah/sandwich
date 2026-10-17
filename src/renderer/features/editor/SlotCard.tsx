import { useRef, useState } from "react";
import { formatDuration } from "../../../shared/formatDuration";
import { slotStatus } from "../../../shared/editorRecipe";
import { IMPORT_EXTENSIONS } from "../../../shared/jobs";
import type { Slot } from "../../../shared/recipe";
import { useJobsStore } from "../jobs/jobsStore";
import { mediaThumbUrl } from "../media/mediaUrls";
import { useEditorStore } from "./editorStore";

export const SLOT_LABELS: Record<Slot, string> = {
  before: "Before",
  after: "After",
  broll: "B-roll",
};

const SECONDARY =
  "rounded-md border border-edge px-3 py-1.5 text-xs transition-colors hover:bg-white/5";

function hasFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 48 ? `${flat.slice(0, 47)}…` : flat;
}

// One of the three slots: thumbnail, length, caption, status. Before and After take a
// dropped or chosen file; B-roll opens the picker.
export const SlotCard: React.FC<{
  slot: Slot;
  mediaBase: string | null;
  onPickBroll: () => void;
}> = ({ slot, mediaBase, onPickBroll }) => {
  const draft = useEditorStore((s) => s.draft);
  const selected = useEditorStore((s) => s.selectedSlot === slot);
  const media = useEditorStore((s) => s.slotMedia[slot]);
  const pending = useEditorStore((s) => s.pending[slot]);
  const missing = useEditorStore((s) => s.missing[slot] === true);
  const error = useEditorStore((s) => s.slotError[slot]);
  const selectSlot = useEditorStore((s) => s.selectSlot);
  const importToSlot = useEditorStore((s) => s.importToSlot);
  const clearSlot = useEditorStore((s) => s.clearSlot);
  const job = useJobsStore((s) =>
    pending ? s.jobs[pending.jobId] : undefined,
  );
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (!draft) {
    return null;
  }
  const clip = draft.clips[["before", "after", "broll"].indexOf(slot)];
  const status = slotStatus(clip, {
    importing: pending !== undefined,
    error: error !== undefined,
    missing,
  });
  const label = SLOT_LABELS[slot];
  const isUgc = slot !== "broll";
  const thumb = media ? mediaThumbUrl(mediaBase, media) : null;
  const percent = Math.round(job?.percent ?? 0);

  return (
    <li
      aria-label={`${label} slot`}
      aria-current={selected ? "true" : undefined}
      data-testid={`slot-${slot}`}
      data-status={status}
      onClick={() => selectSlot(slot)}
      onDragOver={(event) => {
        if (isUgc && hasFiles(event)) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        if (!isUgc) {
          return;
        }
        event.preventDefault();
        setDragging(false);
        selectSlot(slot);
        void importToSlot(slot, Array.from(event.dataTransfer.files));
      }}
      className={
        "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors " +
        (dragging
          ? "border-brand bg-brand/5"
          : selected
            ? "border-brand bg-panel"
            : "border-edge bg-panel hover:border-white/20")
      }
    >
      <div className="relative aspect-[9/16] w-16 shrink-0 overflow-hidden rounded-md bg-app">
        {thumb && !missing ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-xs text-app-dim">
            {slot === "broll" ? "B-roll" : label}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">{label}</h3>
          {status === "ready" || status === "missing" ? (
            <span className="text-xs text-app-muted">
              {formatDuration(clip.duration)}
              {clip.sourceDuration > clip.duration &&
                ` of ${formatDuration(clip.sourceDuration)}`}
            </span>
          ) : null}
        </div>

        {status === "importing" && (
          <div className="mt-2">
            <div
              role="progressbar"
              aria-label={`Importing ${pending?.name ?? "clip"}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-1.5 overflow-hidden rounded bg-white/10"
            >
              <div
                className="h-full bg-brand transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1 truncate text-xs text-app-muted">
              {job?.state === "queued" ? "Waiting" : `Importing ${percent}%`}
              {pending ? ` · ${pending.name}` : ""}
            </p>
          </div>
        )}
        {status === "error" && (
          <p role="alert" className="mt-1 text-xs text-red-400">
            {error}
          </p>
        )}
        {status === "missing" && (
          <p role="alert" className="mt-1 text-xs text-amber-300">
            Clip missing from the library. Replace it.
          </p>
        )}
        {status === "empty" && (
          <p className="mt-1 text-xs text-app-muted">
            {isUgc
              ? "Drop a clip here or choose a file."
              : "Pick product footage."}
          </p>
        )}
        {status === "ready" && (
          <p className="mt-1 truncate text-xs text-app-muted">
            {media?.originalName ?? "Ready"}
          </p>
        )}

        <p className="mt-1 truncate text-xs text-app-dim">
          {clip.caption ? snippet(clip.caption.text) : "No caption"}
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          {isUgc ? (
            <>
              <button
                type="button"
                className={SECONDARY}
                onClick={(event) => {
                  event.stopPropagation();
                  input.current?.click();
                }}
              >
                {clip.mediaPath === "" ? "Choose file" : "Replace"}
              </button>
              <input
                ref={input}
                type="file"
                accept={IMPORT_EXTENSIONS.join(",") + ",video/*"}
                aria-label={`${label} clip file`}
                className="hidden"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  // Choosing the same file twice in a row must still fire onChange.
                  event.target.value = "";
                  selectSlot(slot);
                  void importToSlot(slot, files);
                }}
              />
            </>
          ) : (
            <button
              type="button"
              className={SECONDARY}
              onClick={(event) => {
                event.stopPropagation();
                selectSlot(slot);
                onPickBroll();
              }}
            >
              {clip.mediaPath === "" ? "Choose b-roll" : "Change"}
            </button>
          )}
          {clip.mediaPath !== "" && (
            <button
              type="button"
              className={SECONDARY}
              onClick={(event) => {
                event.stopPropagation();
                clearSlot(slot);
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  );
};
