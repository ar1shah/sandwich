import { useMemo } from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { buildTimeline } from "../src/shared/timeline";
import { ClipLayer } from "./ClipLayer";
import { DebugOverlay } from "./DebugOverlay";
import { useFontReady } from "./fonts";
import type { SandwichProps } from "./types";

// The one composition behind both the Player preview and the export render. It only reads
// the recipe; frame math lives in src/shared/timeline.ts.
export const SandwichVideo: React.FC<SandwichProps> = ({
  recipe,
  mediaBaseUrl,
  showSafeZone = false,
  showTimecode = false,
}) => {
  const { fps } = useVideoConfig();
  const timeline = useMemo(() => buildTimeline(recipe, fps), [recipe, fps]);
  const fontReady = useFontReady();

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {recipe.clips.map((clip, index) => {
        const clipTimeline = timeline.clips[index];
        if (!clipTimeline) {
          return null;
        }
        return (
          <Sequence
            key={clip.slot}
            from={clipTimeline.from}
            durationInFrames={clipTimeline.durationInFrames}
            premountFor={fps}
          >
            <ClipLayer
              clip={clip}
              timeline={clipTimeline}
              mediaBaseUrl={mediaBaseUrl}
              fontReady={fontReady}
            />
          </Sequence>
        );
      })}
      <DebugOverlay
        timeline={timeline}
        showSafeZone={showSafeZone}
        showTimecode={showTimecode}
      />
    </AbsoluteFill>
  );
};
