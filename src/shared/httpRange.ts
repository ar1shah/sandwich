// Parses a single HTTP Range header ("bytes=...") against a known file size.
// Pure string logic. Multi-range requests are ignored (the full file is served).

export type RangeResult =
  | { kind: "none" } // no usable header: serve the whole file with 200
  | { kind: "range"; start: number; end: number } // inclusive byte offsets, 206
  | { kind: "unsatisfiable" }; // 416

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

export function parseRangeHeader(
  header: string | undefined,
  size: number,
): RangeResult {
  if (!header) {
    return { kind: "none" };
  }
  const match = SINGLE_RANGE.exec(header.trim());
  if (!match) {
    return { kind: "none" };
  }
  const [, first = "", last = ""] = match;
  if (first === "" && last === "") {
    return { kind: "none" };
  }

  if (first === "") {
    // Suffix range: the last N bytes.
    const suffix = Number(last);
    if (suffix === 0 || size === 0) {
      return { kind: "unsatisfiable" };
    }
    return { kind: "range", start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(first);
  if (start >= size) {
    return { kind: "unsatisfiable" };
  }
  const requestedEnd = last === "" ? size - 1 : Number(last);
  if (requestedEnd < start) {
    return { kind: "none" };
  }
  return { kind: "range", start, end: Math.min(requestedEnd, size - 1) };
}
