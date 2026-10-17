import {
  CAPTION_START_FONT_SIZE,
  CAPTION_WRAP_FRACTION,
  computeCaptionLayout,
  type CaptionLayout,
} from "../src/shared/captionLayout";
import type { ClipCaption } from "../src/shared/recipe";
import { safeRect } from "../src/shared/safeZone";
import { measureCaptionWidth } from "./measureText";

// Everything that decides how a caption is wrapped and sized, in one non-React module. The
// composition (preview and export) and the editor's readability warning both call
// layoutCaption, so they cannot disagree (golden rule 2). Callers must only call it once
// the caption font is loaded (see useFontReady / loadCaptionFont).

export const SAFE = safeRect();

// Outline: the stroke is drawn on a layer UNDER the fill, so only its outer half shows and
// a thick stroke cannot eat thin letters. Visible outer width = OUTLINE_STROKE / 2 em.
export const OUTLINE_STROKE = 0.15; // em, centered on the glyph edge
export const OUTLINE_RESERVE = 12; // px kept free on each wrap line for the visible stroke

// Box: one rounded white box per line, hugging the line's width (TikTok native look).
export const BOX_PAD_X = 0.35; // em
export const BOX_RADIUS = 0.25; // em
export const BOX_RESERVE = 2 * BOX_PAD_X * CAPTION_START_FONT_SIZE; // px, at the largest size

export const wrapWidth = (style: ClipCaption["style"]): number =>
  SAFE.width * CAPTION_WRAP_FRACTION -
  (style === "box" ? BOX_RESERVE : OUTLINE_RESERVE);

export function layoutCaption(
  caption: Pick<ClipCaption, "text" | "style">,
): CaptionLayout {
  return computeCaptionLayout({
    text: caption.text,
    maxWidth: wrapWidth(caption.style),
    maxHeight: SAFE.height,
    measureWidth: measureCaptionWidth,
  });
}
