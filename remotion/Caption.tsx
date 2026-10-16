import { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import {
  CAPTION_LINE_HEIGHT,
  CAPTION_START_FONT_SIZE,
  CAPTION_WRAP_FRACTION,
  computeCaptionLayout,
  placeCaptionBlock,
} from "../src/shared/captionLayout";
import type { ClipCaption } from "../src/shared/recipe";
import { FRAME_HEIGHT, FRAME_WIDTH, safeRect } from "../src/shared/safeZone";
import { captionFontShorthand, CAPTION_FONT_FAMILY } from "./fonts";
import { measureCaptionWidth } from "./measureText";

const SAFE = safeRect();

// Outline: the stroke is drawn on a layer UNDER the fill, so only its outer half shows and
// a thick stroke cannot eat thin letters. Visible outer width = OUTLINE_STROKE / 2 em.
const OUTLINE_STROKE = 0.15; // em, centered on the glyph edge
const OUTLINE_RESERVE = 12; // px kept free on each wrap line for the visible stroke

// Box: one rounded white box per line, hugging the line's width (TikTok native look).
const BOX_PAD_X = 0.35; // em
const BOX_RADIUS = 0.25; // em
const BOX_RESERVE = 2 * BOX_PAD_X * CAPTION_START_FONT_SIZE; // px, at the largest size

const wrapWidth = (style: ClipCaption["style"]): number =>
  SAFE.width * CAPTION_WRAP_FRACTION -
  (style === "box" ? BOX_RESERVE : OUTLINE_RESERVE);

export const Caption: React.FC<{
  caption: ClipCaption;
  fontReady: boolean;
}> = ({ caption, fontReady }) => {
  // Laid out only after the font is ready: measuring earlier would use fallback metrics.
  const layout = useMemo(
    () =>
      fontReady
        ? computeCaptionLayout({
            text: caption.text,
            maxWidth: wrapWidth(caption.style),
            maxHeight: SAFE.height,
            measureWidth: measureCaptionWidth,
          })
        : null,
    [fontReady, caption.text, caption.style],
  );

  if (!layout || layout.lines.length === 0) {
    return null;
  }

  const { lines, fontSize } = layout;
  const lineHeight = fontSize * CAPTION_LINE_HEIGHT;
  const top = placeCaptionBlock(
    caption.position,
    SAFE,
    lines.length * lineHeight,
  );
  const centerX = SAFE.x + SAFE.width / 2;
  const lineCenterY = (index: number): number =>
    top + (index + 0.5) * lineHeight;

  const textProps = {
    x: centerX,
    textAnchor: "middle" as const,
    dominantBaseline: "central" as const,
    style: { font: captionFontShorthand(fontSize) },
    fontFamily: CAPTION_FONT_FAMILY,
  };

  return (
    <AbsoluteFill>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`}
      >
        {caption.style === "box" ? (
          <>
            {lines.map((line, index) =>
              line === "" ? null : (
                <rect
                  key={`box-${index}`}
                  x={
                    centerX -
                    (measureCaptionWidth(line, fontSize) +
                      2 * BOX_PAD_X * fontSize) /
                      2
                  }
                  y={top + index * lineHeight}
                  width={
                    measureCaptionWidth(line, fontSize) +
                    2 * BOX_PAD_X * fontSize
                  }
                  height={lineHeight}
                  rx={BOX_RADIUS * fontSize}
                  fill="#ffffff"
                />
              ),
            )}
            {lines.map((line, index) => (
              <text
                key={`text-${index}`}
                {...textProps}
                y={lineCenterY(index)}
                fill="#000000"
              >
                {line}
              </text>
            ))}
          </>
        ) : (
          <>
            <g style={{ filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35))" }}>
              {lines.map((line, index) => (
                <text
                  key={`stroke-${index}`}
                  {...textProps}
                  y={lineCenterY(index)}
                  fill="#000000"
                  stroke="#000000"
                  strokeWidth={OUTLINE_STROKE * fontSize}
                  strokeLinejoin="round"
                >
                  {line}
                </text>
              ))}
            </g>
            {lines.map((line, index) => (
              <text
                key={`fill-${index}`}
                {...textProps}
                y={lineCenterY(index)}
                fill="#ffffff"
              >
                {line}
              </text>
            ))}
          </>
        )}
      </svg>
    </AbsoluteFill>
  );
};
