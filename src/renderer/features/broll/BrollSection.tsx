import { useEffect, useMemo, useRef, useState } from "react";
import { brollPlaceholders } from "../../../shared/brollPlaceholders";
import { hasImportExtension, IMPORT_EXTENSIONS } from "../../../shared/jobs";
import type { Media } from "../../../shared/library";
import { useJobsStore } from "../jobs/jobsStore";
import { BrollPlaceholderTile } from "./BrollPlaceholderTile";
import { BrollPreviewModal } from "./BrollPreviewModal";
import { BROLL_GRID_CLASS, BrollTile } from "./BrollTile";
import { DeleteBrollDialog } from "./DeleteBrollDialog";
import { selectProductBroll, useBrollStore } from "./brollStore";

const PRIMARY =
  "rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90";

function hasFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

// The product page's b-roll: drop or pick several clips, watch placeholder tiles fill in,
// hover to preview, click for a bigger player, delete.
export const BrollSection: React.FC<{
  productId: string;
  mediaBase: string | null;
  archived?: boolean;
}> = ({ productId, mediaBase, archived = false }) => {
  const entry = useBrollStore((s) => selectProductBroll(s, productId));
  const load = useBrollStore((s) => s.load);
  const jobs = useJobsStore((s) => s.jobs);
  const cancelJob = useJobsStore((s) => s.cancel);
  const input = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [previewing, setPreviewing] = useState<Media | null>(null);
  const [deleting, setDeleting] = useState<Media | null>(null);

  useEffect(() => {
    void load(productId);
  }, [load, productId]);

  const loadedIds = useMemo(
    () => new Set(entry.items.map((item) => item.id)),
    [entry.items],
  );
  const placeholders = useMemo(
    () =>
      brollPlaceholders(Object.values(jobs), productId, dismissed, loadedIds),
    [jobs, productId, dismissed, loadedIds],
  );

  async function addFiles(files: File[]) {
    setNotice(null);
    if (files.length === 0) {
      return;
    }
    const paths = window.api.files.pathsFor(files);
    const usable: string[] = [];
    let noPath = 0;
    let wrongType = 0;
    for (const filePath of paths) {
      if (!filePath) {
        noPath++;
      } else if (!hasImportExtension(filePath)) {
        wrongType++;
      } else {
        usable.push(filePath);
      }
    }
    const skipped: string[] = [];
    if (wrongType > 0) {
      skipped.push(
        `${wrongType} not ${IMPORT_EXTENSIONS.join(", ")} video${wrongType === 1 ? "" : "s"}`,
      );
    }
    if (noPath > 0) {
      skipped.push(`${noPath} not saved on this computer`);
    }
    const skippedText =
      skipped.length > 0 ? `Skipped ${skipped.join(" and ")}.` : null;
    if (usable.length === 0) {
      setNotice(skippedText ?? "Choose video files to import.");
      return;
    }
    try {
      const result = await window.api.broll.import(productId, usable);
      setNotice(result.ok ? skippedText : result.message);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const showEmpty =
    entry.loaded &&
    !entry.error &&
    entry.items.length === 0 &&
    placeholders.length === 0;

  return (
    <section
      aria-label="B-roll"
      onDragOver={(event) => {
        if (!archived && hasFiles(event)) {
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
        event.preventDefault();
        setDragging(false);
        if (!archived) {
          void addFiles(Array.from(event.dataTransfer.files));
        }
      }}
      className={
        "mt-8 rounded-xl border border-dashed p-4 transition-colors " +
        (dragging ? "border-brand bg-brand/5" : "border-transparent")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-app-dim">
          B-roll
        </h2>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={archived}
          className={`${PRIMARY} disabled:opacity-50`}
        >
          Add b-roll
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept={IMPORT_EXTENSIONS.join(",") + ",video/*"}
          aria-label="B-roll files"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            // Same file twice in a row must still fire onChange.
            event.target.value = "";
            void addFiles(files);
          }}
        />
      </div>

      {notice && (
        <p role="status" className="mt-3 text-sm text-app-muted">
          {notice}
        </p>
      )}
      {entry.error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          Could not load b-roll: {entry.error}
        </p>
      )}

      {showEmpty && (
        <div className="mt-6 rounded-xl border border-dashed border-edge px-6 py-12 text-center">
          <h3 className="text-base font-medium">No b-roll yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-app-muted">
            B-roll is footage of the product itself. Add it once and reuse it in
            every video for this product. Drop video files here, or use Add
            b-roll.
          </p>
        </div>
      )}

      {(entry.items.length > 0 || placeholders.length > 0) && (
        <ul className={`${BROLL_GRID_CLASS} mt-4`} aria-label="B-roll clips">
          {placeholders.map((placeholder) => (
            <BrollPlaceholderTile
              key={placeholder.jobId}
              placeholder={placeholder}
              onCancel={(jobId) => void cancelJob(jobId)}
              onDismiss={(jobId) =>
                setDismissed((current) => new Set(current).add(jobId))
              }
            />
          ))}
          {entry.items.map((media) => (
            <BrollTile
              key={media.id}
              media={media}
              mediaBase={mediaBase}
              onSelect={() => setPreviewing(media)}
              onDelete={() => setDeleting(media)}
            />
          ))}
        </ul>
      )}

      {previewing && (
        <BrollPreviewModal
          media={previewing}
          mediaBase={mediaBase}
          onClose={() => setPreviewing(null)}
        />
      )}
      {deleting && (
        <DeleteBrollDialog media={deleting} onClose={() => setDeleting(null)} />
      )}
    </section>
  );
};
