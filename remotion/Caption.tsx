import { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import {
  CAPTION_LINE_HEIGHT,
  placeCaptionBlock,
} from "../src/shared/captionLayout";
import type { ClipCaption } from "../src/shared/recipe";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../src/shared/safeZone";
import {
  BOX_PAD_X,
  BOX_RADIUS,
  layoutCaption,
  OUTLINE_STROKE,
  SAFE,
} from "./captionGeometry";
import { captionFontShorthand, CAPTION_FONT_FAMILY } from "./fonts";
import { measureCaptionWidth } from "./measureText";

export const Caption: React.FC<{
  caption: ClipCaption;
  fontReady: boolean;
}> = ({ caption, fontReady }) => {
  // Laid out only after the font is ready: measuring earlier would use fallback metrics.
  const layout = useMemo(
    () =>
      fontReady
        ? layoutCaption({ text: caption.text, style: caption.style })
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
        data-testid="caption-svg"
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
                data-testid="caption-line"
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
                data-testid="caption-line"
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
