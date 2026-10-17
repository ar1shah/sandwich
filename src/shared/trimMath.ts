// All trim math for the clip panel (SPEC 5.1 step 4): drag deltas, numeric fields and
// keyboard nudges turn into a new { start, duration } that is always valid for the recipe
// (start >= 0, duration >= the minimum, start + duration <= the source length). Pure.
//
// Drags are computed from the gesture's ORIGIN trim and the TOTAL pointer delta, never by
// adding each small move to the current trim: snapping would swallow slow drags.

export const TRIM_STEP = 0.1;
export const MIN_TRIM_DURATION = 0.5;

export type Trim = { start: number; duration: number };
export type Direction = -1 | 1;

// Float slack when deciding which grid line a value is on.
const EPS = 1e-9;
// Results are rounded to a microsecond so 0.1 + 0.2 style noise never reaches the recipe.
// The recipe tolerates 1e-6 past the source end, and this rounds by at most 5e-7.
const tidy = (value: number): number => Math.round(value * 1e6) / 1e6;

export function trimEnd(trim: Trim): number {
  return tidy(trim.start + trim.duration);
}

export function sameTrim(a: Trim, b: Trim): boolean {
  return (
    Math.abs(a.start - b.start) < 1e-6 &&
    Math.abs(a.duration - b.duration) < 1e-6
  );
}

// Nearest 0.1 s.
export function snap(value: number): number {
  return tidy(Math.round(value / TRIM_STEP + EPS) * TRIM_STEP);
}

// The shortest window allowed: 0.5 s, or the whole clip when the clip is shorter.
export function minDuration(source: number): number {
  return Math.min(MIN_TRIM_DURATION, Math.max(0, source));
}

// Forces a trim inside the clip. Does not snap.
export function clampTrim(trim: Trim, source: number): Trim {
  const length = Math.max(0, source);
  const duration = Math.min(
    Math.max(trim.duration, minDuration(length)),
    length,
  );
  const start = Math.min(Math.max(trim.start, 0), length - duration);
  return { start: tidy(start), duration: tidy(duration) };
}

// Builds a trim from its two edges (already snapped), keeping the minimum length.
function fromEdges(start: number, end: number, source: number): Trim {
  return clampTrim({ start, duration: end - start }, source);
}

// Drag the window body: the length stays, the start follows the pointer. The end of the
// clip wins over the grid, so the window can always reach the very end of an off-grid
// source (8.37 s).
export function moveWindow(
  origin: Trim,
  deltaSeconds: number,
  source: number,
): Trim {
  if (deltaSeconds === 0) {
    return clampTrim(origin, source);
  }
  return clampTrim(
    { start: snap(origin.start + deltaSeconds), duration: origin.duration },
    source,
  );
}

// Drag the left edge: the end stays where it was.
export function resizeStart(
  origin: Trim,
  deltaSeconds: number,
  source: number,
): Trim {
  if (deltaSeconds === 0) {
    return clampTrim(origin, source);
  }
  const end = trimEnd(origin);
  const latest = Math.max(0, end - minDuration(source));
  const start = Math.min(
    Math.max(snap(origin.start + deltaSeconds), 0),
    latest,
  );
  return fromEdges(start, end, source);
}

// Drag the right edge: the start stays where it was.
export function resizeEnd(
  origin: Trim,
  deltaSeconds: number,
  source: number,
): Trim {
  if (deltaSeconds === 0) {
    return clampTrim(origin, source);
  }
  const earliest = origin.start + minDuration(source);
  const end = Math.min(
    Math.max(snap(trimEnd(origin) + deltaSeconds), earliest),
    source,
  );
  return fromEdges(origin.start, end, source);
}

// Typed start: the length stays, the window is pushed back inside the clip.
export function setStart(trim: Trim, value: number, source: number): Trim {
  return clampTrim({ start: snap(value), duration: trim.duration }, source);
}

// Typed length: the start stays; if the window would run past the end, the start moves
// earlier so the typed length is honored (capped at the clip length).
export function setDuration(trim: Trim, value: number, source: number): Trim {
  const duration = Math.min(
    Math.max(snap(value), minDuration(source)),
    Math.max(0, source),
  );
  return clampTrim({ start: trim.start, duration }, source);
}

// "Reset to default length": keep the start, use the slot's default length (or the whole
// clip when it is shorter), and move the start earlier only if that overflows.
export function resetLength(
  trim: Trim,
  slotDefault: number,
  source: number,
): Trim {
  const duration = Math.min(
    Math.max(slotDefault, minDuration(source)),
    Math.max(0, source),
  );
  return clampTrim({ start: trim.start, duration }, source);
}

export function isAtResetLength(
  trim: Trim,
  slotDefault: number,
  source: number,
): boolean {
  return sameTrim(trim, resetLength(trim, slotDefault, source));
}

// One step along the 0.1 s grid. A value off the grid (the end of an 8.37 s clip) first
// moves to the next grid line in that direction, then steps.
function stepped(value: number, direction: Direction, step: number): number {
  const grid =
    direction > 0
      ? Math.floor(value / TRIM_STEP + EPS) * TRIM_STEP
      : Math.ceil(value / TRIM_STEP - EPS) * TRIM_STEP;
  return tidy(grid + direction * step);
}

export function nudgeWindow(
  trim: Trim,
  direction: Direction,
  step: number,
  source: number,
): Trim {
  return clampTrim(
    {
      start: stepped(trim.start, direction, step),
      duration: trim.duration,
    },
    source,
  );
}

export function nudgeStart(
  trim: Trim,
  direction: Direction,
  step: number,
  source: number,
): Trim {
  const end = trimEnd(trim);
  const latest = Math.max(0, end - minDuration(source));
  const start = Math.min(
    Math.max(stepped(trim.start, direction, step), 0),
    latest,
  );
  return fromEdges(start, end, source);
}

export function nudgeEnd(
  trim: Trim,
  direction: Direction,
  step: number,
  source: number,
): Trim {
  const earliest = trim.start + minDuration(source);
  const end = Math.min(
    Math.max(stepped(trimEnd(trim), direction, step), earliest),
    source,
  );
  return fromEdges(trim.start, end, source);
}

// Pointer travel on the track to seconds of the clip.
export function pxToSeconds(
  pixels: number,
  trackWidth: number,
  source: number,
): number {
  return trackWidth > 0 ? (pixels / trackWidth) * source : 0;
}

// The reverse, for placing the window on the track.
export function secondsToPx(
  seconds: number,
  trackWidth: number,
  source: number,
): number {
  return source > 0 ? (seconds / source) * trackWidth : 0;
}
