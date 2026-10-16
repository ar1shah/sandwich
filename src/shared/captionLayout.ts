import type { SafeRect } from "./safeZone";

// Caption wrapping, shrink-to-fit and placement (docs/reference/SPEC.md section 7).
// Pure: text measurement is injected, so the composition passes a canvas measurer and the
// tests pass a fake one.

export const CAPTION_START_FONT_SIZE = 64;
export const CAPTION_MIN_FONT_SIZE = 36;
export const CAPTION_FONT_STEP = 2;
export const CAPTION_MAX_LINES = 3;
export const CAPTION_LINE_HEIGHT = 1.2;
// Wrap width as a fraction of the safe rect width.
export const CAPTION_WRAP_FRACTION = 0.8;

export type MeasureWidth = (text: string, fontSize: number) => number;

export type CaptionLayout = {
  lines: string[];
  fontSize: number;
  // True when the text still needs more than CAPTION_MAX_LINES lines, or the block is
  // taller than maxHeight, at the font floor. All lines are kept (user text is never
  // truncated); the editor uses this flag to warn.
  overflow: boolean;
};

function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  fontSize: number,
  measureWidth: MeasureWidth,
): string[] {
  const fits = (text: string): boolean =>
    measureWidth(text, fontSize) <= maxWidth;
  const words = paragraph.split(/\s+/).filter((word) => word !== "");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current !== "") {
      lines.push(current);
      current = "";
    }
    if (fits(word)) {
      current = word;
      continue;
    }
    // A single word wider than the line: break it by character.
    for (const char of Array.from(word)) {
      const next = current + char;
      if (current !== "" && !fits(next)) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }
  }
  if (current !== "") {
    lines.push(current);
  }
  return lines;
}

// Greedy word wrap. Explicit "\n" breaks are kept (blank lines in the middle stay,
// leading and trailing blank lines are dropped).
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  measureWidth: MeasureWidth,
): string[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((paragraph) => {
      const wrapped = wrapParagraph(
        paragraph,
        maxWidth,
        fontSize,
        measureWidth,
      );
      return wrapped.length === 0 ? [""] : wrapped;
    });
  while (lines[0] === "") {
    lines.shift();
  }
  while (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

export type CaptionLayoutInput = {
  text: string;
  maxWidth: number; // already reduced by stroke or box padding
  maxHeight: number;
  measureWidth: MeasureWidth;
  startFontSize?: number;
  minFontSize?: number;
  fontStep?: number;
  maxLines?: number;
  lineHeight?: number;
};

export function computeCaptionLayout({
  text,
  maxWidth,
  maxHeight,
  measureWidth,
  startFontSize = CAPTION_START_FONT_SIZE,
  minFontSize = CAPTION_MIN_FONT_SIZE,
  fontStep = CAPTION_FONT_STEP,
  maxLines = CAPTION_MAX_LINES,
  lineHeight = CAPTION_LINE_HEIGHT,
}: CaptionLayoutInput): CaptionLayout {
  const layoutAt = (fontSize: number): CaptionLayout => {
    const lines = wrapText(text, maxWidth, fontSize, measureWidth);
    const overflow =
      lines.length > maxLines ||
      lines.length * fontSize * lineHeight > maxHeight;
    return { lines, fontSize, overflow };
  };

  let fontSize = startFontSize;
  while (fontSize > minFontSize) {
    const layout = layoutAt(fontSize);
    if (!layout.overflow) {
      return layout;
    }
    fontSize -= fontStep;
  }
  // The floor: whatever still does not fit is kept and flagged.
  return layoutAt(minFontSize);
}

export type CaptionPosition = "top" | "middle";

// Top edge (px) of the text block. `top` centers the block in the upper third of the safe
// rect, `middle` in the whole safe rect. The block is clamped to stay inside the rect; a
// block taller than the rect starts at the rect's top.
export function placeCaptionBlock(
  position: CaptionPosition,
  safe: SafeRect,
  blockHeight: number,
): number {
  const centerY =
    position === "top" ? safe.y + safe.height / 6 : safe.y + safe.height / 2;
  const top = centerY - blockHeight / 2;
  const lowest = safe.y + safe.height - blockHeight;
  return Math.max(safe.y, Math.min(top, lowest));
}
