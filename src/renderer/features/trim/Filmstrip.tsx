import { useEffect, useMemo, useRef, useState } from "react";
import {
  filmstripTiles,
  type FilmstripLayout,
} from "../../../shared/filmstripLayout";
import {
  minDuration,
  moveWindow,
  nudgeEnd,
  nudgeStart,
  nudgeWindow,
  pxToSeconds,
  resizeEnd,
  resizeStart,
  secondsToPx,
  trimEnd,
  type Direction,
  type Trim,
} from "../../../shared/trimMath";

export const TRACK_HEIGHT = 64;
// A handle's hit area extends this far OUTSIDE the window, so a 3 s window on a 45 s clip
// (about 20 px) still has grabbable edges.
const HANDLE_OUTSIDE = 12;
const HANDLE_INSIDE = 4;
// The window is drawn at least this wide; the trim itself does not change.
const MIN_WINDOW_PX = 24;
const FINE_STEP = 0.1;
const COARSE_STEP = 1;

export type TrimKind = "move" | "start" | "end";

type Drag = {
  kind: TrimKind;
  pointerId: number;
  originX: number;
  origin: Trim;
  trackWidth: number;
  element: HTMLElement;
};

// The clip as a strip of frames with the chosen window over it. Dragging the body moves
// the window, dragging a handle moves that edge. A drag is computed from where it began
// (origin trim + total pointer travel) so snapping never swallows slow movement.
export const Filmstrip: React.FC<{
  source: number;
  trim: Trim;
  spriteUrl: string | null;
  layout: FilmstripLayout | null;
  // The trim changed (drag move or key press). `kind` says which edge decides the preview.
  onChange: (trim: Trim, kind: TrimKind, via: "drag" | "key") => void;
  // The pointer drag ended with the trim where onChange last put it.
  onDragEnd: () => void;
}> = ({ source, trim, spriteUrl, layout, onChange, onDragEnd }) => {
  const track = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const drag = useRef<Drag | null>(null);
  // The sprite file is gone (deleted outside the app): say so instead of drawing broken images.
  const [spriteFailed, setSpriteFailed] = useState(false);
  useEffect(() => {
    setSpriteFailed(false);
  }, [spriteUrl]);

  useEffect(() => {
    const element = track.current;
    if (!element) {
      return;
    }
    const measure = () => setTrackWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const cells = useMemo(
    () =>
      layout && spriteUrl
        ? filmstripTiles(layout, source, trackWidth, TRACK_HEIGHT)
        : null,
    [layout, spriteUrl, source, trackWidth],
  );

  const left = secondsToPx(trim.start, trackWidth, source);
  const width = secondsToPx(trim.duration, trackWidth, source);
  // Drawn wider when tiny, centred on the real window and kept on the track.
  const drawnWidth = Math.min(trackWidth, Math.max(width, MIN_WINDOW_PX));
  const drawnLeft = Math.min(
    Math.max(left - (drawnWidth - width) / 2, 0),
    Math.max(0, trackWidth - drawnWidth),
  );

  function begin(kind: TrimKind) {
    return (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || trackWidth <= 0) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
      drag.current = {
        kind,
        pointerId: event.pointerId,
        originX: event.clientX,
        origin: trim,
        trackWidth,
        element: event.currentTarget,
      };
    };
  }

  function move(event: React.PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) {
      return;
    }
    const seconds = pxToSeconds(
      event.clientX - current.originX,
      current.trackWidth,
      source,
    );
    const next =
      current.kind === "move"
        ? moveWindow(current.origin, seconds, source)
        : current.kind === "start"
          ? resizeStart(current.origin, seconds, source)
          : resizeEnd(current.origin, seconds, source);
    onChange(next, current.kind, "drag");
  }

  function finish(event: React.PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) {
      return;
    }
    drag.current = null;
    if (current.element.hasPointerCapture(event.pointerId)) {
      current.element.releasePointerCapture(event.pointerId);
    }
    onDragEnd();
  }

  // Escape puts the trim back where the drag began and ends it without saving.
  function cancelDrag(): boolean {
    const current = drag.current;
    if (!current) {
      return false;
    }
    drag.current = null;
    if (current.element.hasPointerCapture(current.pointerId)) {
      current.element.releasePointerCapture(current.pointerId);
    }
    onChange(current.origin, current.kind, "drag");
    return true;
  }

  const step = (event: React.KeyboardEvent) =>
    event.shiftKey ? COARSE_STEP : FINE_STEP;

  function keyDown(on: TrimKind) {
    return (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.code === "Escape") {
        if (cancelDrag()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      let direction: Direction | null = null;
      if (event.code === "ArrowLeft") {
        direction = -1;
      } else if (event.code === "ArrowRight") {
        direction = 1;
      }
      let next: Trim | null = null;
      let kind: TrimKind = on;
      if (direction !== null) {
        if (on === "move") {
          next = nudgeWindow(trim, direction, step(event), source);
        } else if (on === "start") {
          next = nudgeStart(trim, direction, step(event), source);
        } else {
          next = nudgeEnd(trim, direction, step(event), source);
        }
      } else if (event.code === "BracketLeft") {
        // [ pulls the start edge earlier, Shift+[ pushes it later; always 0.1 s.
        next = nudgeStart(trim, event.shiftKey ? 1 : -1, FINE_STEP, source);
        kind = "start";
      } else if (event.code === "BracketRight") {
        next = nudgeEnd(trim, event.shiftKey ? -1 : 1, FINE_STEP, source);
        kind = "end";
      }
      if (next) {
        event.preventDefault();
        onChange(next, kind, "key");
      }
    };
  }

  const min = minDuration(source);
  const end = trimEnd(trim);

  return (
    <div className="px-3" data-testid="filmstrip">
      <div
        ref={track}
        className="relative select-none touch-none"
        style={{ height: TRACK_HEIGHT }}
      >
        <div
          className="absolute inset-0 overflow-hidden rounded-md bg-black/40"
          aria-hidden="true"
        >
          {spriteFailed && (
            <span className="absolute inset-0 grid place-items-center text-xs text-app-dim">
              Preview strip missing
            </span>
          )}
          {!spriteFailed &&
            cells?.tiles.map((tile) => (
              <div
                key={tile.left}
                className="absolute top-0 h-full overflow-hidden"
                style={{ left: tile.left, width: tile.width }}
              >
                <img
                  src={spriteUrl ?? undefined}
                  alt=""
                  draggable={false}
                  className="absolute top-0 max-w-none"
                  onError={() => setSpriteFailed(true)}
                  style={{
                    left: tile.offsetX,
                    width: cells.spriteWidth,
                    height: cells.spriteHeight,
                  }}
                />
              </div>
            ))}
          <div
            className="absolute inset-y-0 left-0 bg-black/60"
            style={{ width: left }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-black/60"
            style={{ width: Math.max(0, trackWidth - left - width) }}
          />
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Trim window"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, source - trim.duration)}
          aria-valuenow={trim.start}
          aria-valuetext={`${trim.start.toFixed(1)} s to ${end.toFixed(1)} s`}
          data-testid="trim-window"
          className="absolute inset-y-0 cursor-grab touch-none rounded-sm border-y-2 border-brand outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-brand"
          style={{ left: drawnLeft, width: drawnWidth }}
          onPointerDown={begin("move")}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onKeyDown={keyDown("move")}
        />

        <div
          role="slider"
          tabIndex={0}
          aria-label="Trim start"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, end - min)}
          aria-valuenow={trim.start}
          data-testid="trim-handle-start"
          className="group absolute inset-y-0 cursor-ew-resize touch-none outline-none"
          style={{
            left: drawnLeft - HANDLE_OUTSIDE,
            width: HANDLE_OUTSIDE + HANDLE_INSIDE,
          }}
          onPointerDown={begin("start")}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onKeyDown={keyDown("start")}
        >
          <span className="absolute inset-y-0 right-0 w-1 rounded-l-sm bg-brand group-focus-visible:ring-2 group-focus-visible:ring-white" />
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Trim end"
          aria-valuemin={trim.start + min}
          aria-valuemax={source}
          aria-valuenow={end}
          data-testid="trim-handle-end"
          className="group absolute inset-y-0 cursor-ew-resize touch-none outline-none"
          style={{
            left: drawnLeft + drawnWidth - HANDLE_INSIDE,
            width: HANDLE_OUTSIDE + HANDLE_INSIDE,
          }}
          onPointerDown={begin("end")}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onKeyDown={keyDown("end")}
        >
          <span className="absolute inset-y-0 left-0 w-1 rounded-r-sm bg-brand group-focus-visible:ring-2 group-focus-visible:ring-white" />
        </div>
      </div>
    </div>
  );
};
