import { loadFont } from "@remotion/fonts";
import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import type { SpikeProps } from "./types";

// Throwaway composition for step 0.4: three clips back to back plus a text overlay.
// The font comes from the Remotion public dir (assets/) via staticFile, to prove that
// public-dir assets resolve from the prebuilt bundle in the packaged app.
const FONT_FAMILY = "Spike TikTok Sans";
const FONT_FILE = "fonts/TikTokSans36pt-Bold.ttf";

const useSpikeFont = (): void => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading the spike font"));

  useEffect(() => {
    loadFont({
      family: FONT_FAMILY,
      url: staticFile(FONT_FILE),
      weight: "700",
    })
      .then(() => continueRender(handle))
      .catch((error: unknown) => cancelRender(error));
  }, [handle, continueRender, cancelRender]);
};

const labelStyle: React.CSSProperties = {
  fontFamily: `"${FONT_FAMILY}", sans-serif`,
  fontWeight: 700,
  color: "white",
  textShadow: "0 4px 18px rgba(0, 0, 0, 0.85)",
};

export const Spike: React.FC<SpikeProps> = ({ title, clips }) => {
  useSpikeFont();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const active =
    clips.find(
      (clip) => frame >= clip.from && frame < clip.from + clip.durationInFrames,
    ) ?? clips[clips.length - 1];

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {clips.map((clip) => (
        <Sequence
          key={clip.slot}
          from={clip.from}
          durationInFrames={clip.durationInFrames}
          premountFor={fps}
        >
          <OffthreadVideo
            src={clip.src}
            trimBefore={clip.trimBeforeFrames}
            muted={clip.muted}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Sequence>
      ))}
      <AbsoluteFill
        style={{
          ...labelStyle,
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 420,
        }}
      >
        <div style={{ fontSize: 64, opacity: 0.9 }}>{title}</div>
        <div style={{ fontSize: 120, textTransform: "uppercase" }}>
          {active?.slot}
        </div>
        <div style={{ fontSize: 56 }}>
          {(frame / fps).toFixed(2)} s f{frame}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
