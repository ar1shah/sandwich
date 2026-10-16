import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { safeRect } from "../src/shared/safeZone";
import type { Timeline } from "../src/shared/timeline";

const SAFE = safeRect();

// Debug-only drawing: the safe-zone rectangle and a timecode label. Never shown in a real
// export (both props default to false).
export const DebugOverlay: React.FC<{
  timeline: Timeline;
  showSafeZone: boolean;
  showTimecode: boolean;
}> = ({ timeline, showSafeZone, showTimecode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const clip =
    timeline.clips.find(
      (item) => frame >= item.from && frame < item.from + item.durationInFrames,
    ) ?? timeline.clips[timeline.clips.length - 1];
  const local = clip ? frame - clip.from : 0;
  const sourceSeconds = clip ? (clip.trimBeforeFrames + local) / fps : 0;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {showSafeZone && (
        <div
          style={{
            position: "absolute",
            left: SAFE.x,
            top: SAFE.y,
            width: SAFE.width,
            height: SAFE.height,
            boxSizing: "border-box",
            border: "4px dashed #ff2bd6",
          }}
        />
      )}
      {showTimecode && clip && (
        <div
          style={{
            position: "absolute",
            left: 40,
            bottom: 40,
            padding: "10px 16px",
            borderRadius: 12,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            color: "#7dff9b",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 34,
            lineHeight: 1.35,
            whiteSpace: "pre",
          }}
        >
          {`${clip.slot.toUpperCase()}  clip f${local}/${clip.durationInFrames}\nsource ${sourceSeconds.toFixed(2)}s  global f${frame}`}
        </div>
      )}
    </AbsoluteFill>
  );
};
