// Safe zone for captions, as fractions of the frame (docs/reference/SPEC.md section 8).
// Starting values: tune by testing real TikTok uploads. The preview overlay and the caption
// layout both read from here so they cannot disagree.

export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1920;

export const SAFE_ZONE = {
  top: 0.08,
  bottom: 0.22,
  left: 0.06,
  right: 0.16,
} as const;

export type SafeRect = { x: number; y: number; width: number; height: number };

// Pixel rectangle inside the safe zone. The four edges are rounded first and the size is
// the difference, so adjacent edges are always exact pixels.
export function safeRect(
  width: number = FRAME_WIDTH,
  height: number = FRAME_HEIGHT,
): SafeRect {
  const left = Math.round(width * SAFE_ZONE.left);
  const right = Math.round(width * (1 - SAFE_ZONE.right));
  const top = Math.round(height * SAFE_ZONE.top);
  const bottom = Math.round(height * (1 - SAFE_ZONE.bottom));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
