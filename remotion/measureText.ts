import { captionFontShorthand } from "./fonts";

// Canvas text measurement for caption layout. Callers must only measure once the caption
// font is loaded (see useFontReady); a measurement taken with fallback metrics is never
// cached.
let context: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

export function measureCaptionWidth(text: string, fontSize: number): number {
  const key = `${fontSize}|${text}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  context ??= document.createElement("canvas").getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D is not available to measure caption text.");
  }
  const font = captionFontShorthand(fontSize);
  context.font = font;
  context.letterSpacing = "0px";
  const width = context.measureText(text).width;

  if (document.fonts.check(font)) {
    cache.set(key, width);
  }
  return width;
}
