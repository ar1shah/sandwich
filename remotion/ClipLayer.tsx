import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { mediaUrl } from "../src/shared/mediaUrl";
import type { ClipSpec } from "../src/shared/recipe";
import type { ClipTimeline } from "../src/shared/timeline";
import { zoomScale } from "../src/shared/zoom";
import { Caption } from "./Caption";

// One slot: cover-fit video with trim, zoom and mute, then the caption on top. Rendered
// inside the slot's <Sequence>, so useCurrentFrame() is the frame within the clip.
export const ClipLayer: React.FC<{
  clip: ClipSpec;
  timeline: ClipTimeline;
  mediaBaseUrl: string;
  fontReady: boolean;
  // Editor preview only: shown while the slot has no media.
  placeholder?: string;
}> = ({ clip, timeline, mediaBaseUrl, fontReady, placeholder }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = zoomScale(clip.zoom, frame, timeline.durationInFrames, fps);
  const origin = `${clip.focus.x * 100}% ${clip.focus.y * 100}%`;
  const hasCaption = clip.caption !== null && clip.caption.text.trim() !== "";

  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      {clip.mediaPath !== "" && (
        <AbsoluteFill
          style={{ transform: `scale(${scale})`, transformOrigin: origin }}
        >
          <OffthreadVideo
            src={mediaUrl(mediaBaseUrl, clip.mediaPath)}
            trimBefore={timeline.trimBeforeFrames}
            muted={clip.muted}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: origin,
            }}
          />
        </AbsoluteFill>
      )}
      {clip.mediaPath === "" && placeholder !== undefined && (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#1c1c22",
            color: "#9a9aa8",
            fontFamily: "system-ui, sans-serif",
            fontSize: 64,
            fontWeight: 600,
            textAlign: "center",
            padding: 120,
          }}
        >
          {placeholder}
        </AbsoluteFill>
      )}
      {hasCaption && clip.caption && (
        <Caption caption={clip.caption} fontReady={fontReady} />
      )}
    </AbsoluteFill>
  );
};
