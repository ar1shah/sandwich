import { useCallback, useEffect, useRef, useState } from "react";
import { filmstripLayout } from "../../../shared/filmstripLayout";
import { SLOTS, type Slot } from "../../../shared/recipe";
import {
  isAtResetLength,
  resetLength,
  setDuration,
  setStart,
  trimEnd,
  type Trim,
} from "../../../shared/trimMath";
import { useEditorStore } from "../editor/editorStore";
import { mediaFilmstripUrl } from "../media/mediaUrls";
import { usePreviewStore } from "../preview/previewStore";
import { useProductsStore } from "../products/productsStore";
import { useSettingsStore } from "../settings/settingsStore";
import { Filmstrip, type TrimKind } from "./Filmstrip";

// 3.0, 5.37, 3.1: at least one decimal, at most two.
function seconds(value: number): string {
  return value.toFixed(2).replace(/0$/, "");
}

// A number box that edits freely and commits on blur or Enter. Anything that is not a
// number goes back to the current value.
const NumberField: React.FC<{
  label: string;
  testId: string;
  value: number;
  onCommit: (value: number) => void;
}> = ({ label, testId, value, onCommit }) => {
  const [text, setText] = useState<string | null>(null);

  function commit() {
    if (text === null) {
      return;
    }
    const parsed = Number(text.trim().replace(",", "."));
    setText(null);
    if (text.trim() !== "" && Number.isFinite(parsed)) {
      onCommit(parsed);
    }
  }

  return (
    <label className="flex flex-1 flex-col gap-1 text-xs text-app-muted">
      {label}
      <span className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          data-testid={testId}
          className="w-full rounded-md border border-edge bg-transparent px-2 py-1.5 text-sm tabular-nums text-app-text"
          value={text ?? seconds(value)}
          onChange={(event) => setText(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              setText(null);
              event.currentTarget.blur();
            }
          }}
        />
        <span>s</span>
      </span>
    </label>
  );
};

// Trim section of the clip panel: filmstrip with the window, start and length boxes, and
// "Reset to default length". The Player follows every change (paused, at the edge being
// moved), so the preview always shows the frame you are trimming to.
export const TrimSection: React.FC<{ slot: Slot }> = ({ slot }) => {
  const clip = useEditorStore((s) => s.draft?.clips[SLOTS.indexOf(slot)]);
  const media = useEditorStore((s) => s.slotMedia[slot]);
  const setTrim = useEditorStore((s) => s.setTrim);
  const finishTrim = useEditorStore((s) => s.finishTrim);
  const mediaBase = useProductsStore((s) => s.mediaBase);
  const defaultLength = useSettingsStore((s) => s.settings.clipDurations[slot]);
  const requestSeek = usePreviewStore((s) => s.requestSeek);

  // At most one seek per animation frame while the pointer moves.
  const frame = useRef<number | null>(null);
  const edge = useRef<"start" | "end">("start");
  const seek = useCallback(
    (next: "start" | "end") => {
      edge.current = next;
      if (frame.current !== null) {
        return;
      }
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        requestSeek({ slot, edge: edge.current }, { pause: true });
      });
    },
    [requestSeek, slot],
  );
  useEffect(
    () => () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }
    },
    [],
  );

  if (!clip || clip.mediaPath === "" || !(clip.sourceDuration > 0)) {
    return null;
  }
  // Bounds come from the recipe, so they match what the export will accept.
  const source = clip.sourceDuration;
  const trim: Trim = { start: clip.trimStart, duration: clip.duration };
  const layout = media
    ? filmstripLayout(media.duration, media.width, media.height)
    : null;
  const spriteUrl = media ? mediaFilmstripUrl(mediaBase, media) : null;

  function change(next: Trim, kind: TrimKind, via: "drag" | "key") {
    setTrim(slot, next, via === "drag" ? "none" : "debounced");
    seek(kind === "end" ? "end" : "start");
  }

  function commitField(next: Trim) {
    setTrim(slot, next, "now");
    seek("start");
  }

  return (
    <section aria-label="Trim" className="space-y-3" data-testid="trim-section">
      <h3 className="text-xs font-medium uppercase tracking-wide text-app-muted">
        Trim
      </h3>
      <Filmstrip
        source={source}
        trim={trim}
        spriteUrl={spriteUrl}
        layout={layout}
        onChange={change}
        onDragEnd={finishTrim}
      />
      <div className="flex gap-3">
        <NumberField
          label="Start"
          testId="trim-start"
          value={trim.start}
          onCommit={(value) => commitField(setStart(trim, value, source))}
        />
        <NumberField
          label="Length"
          testId="trim-duration"
          value={trim.duration}
          onCommit={(value) => commitField(setDuration(trim, value, source))}
        />
      </div>
      <p
        className="text-xs tabular-nums text-app-muted"
        data-testid="trim-summary"
      >
        {seconds(trim.start)} s to {seconds(trimEnd(trim))} s of{" "}
        {seconds(source)} s
      </p>
      <button
        type="button"
        data-testid="trim-reset"
        disabled={isAtResetLength(trim, defaultLength, source)}
        onClick={() => commitField(resetLength(trim, defaultLength, source))}
        className="rounded-md border border-edge px-3 py-1.5 text-xs transition-colors hover:bg-white/5 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Reset to default length ({seconds(defaultLength)} s)
      </button>
    </section>
  );
};
