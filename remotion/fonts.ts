import { loadFont } from "@remotion/fonts";
import { useEffect, useState } from "react";
import { useDelayRender } from "remotion";
import captionFontUrl from "../assets/fonts/TikTokSans36pt-Bold.ttf";

// One open-license font for captions in preview and export (DECISIONS #12): TikTok Sans
// 36pt Bold. It is imported as a module, so the Vite renderer (Player) and the Remotion
// bundler (render) each emit and resolve it themselves; no staticFile() base to get wrong
// under file:// (DECISIONS #34).
export const CAPTION_FONT_FAMILY = "Sandwich Caption";
export const CAPTION_FONT_WEIGHT = 700;

// The exact CSS font shorthand used for drawing AND for canvas measuring, so the two
// cannot disagree.
export const captionFontShorthand = (fontSize: number): string =>
  `${CAPTION_FONT_WEIGHT} ${fontSize}px "${CAPTION_FONT_FAMILY}", sans-serif`;

// Module level, so a Player remount never registers a duplicate FontFace.
let fontPromise: Promise<void> | null = null;

export function loadCaptionFont(): Promise<void> {
  fontPromise ??= loadFont({
    family: CAPTION_FONT_FAMILY,
    url: captionFontUrl,
    weight: String(CAPTION_FONT_WEIGHT),
  }).catch((error: unknown) => {
    fontPromise = null; // allow a retry on the next mount
    throw error;
  });
  return fontPromise;
}

// Holds the render (delayRender) until the font is loaded and returns whether it is.
// Anything that measures or draws caption text must wait for `true`.
export function useFontReady(): boolean {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading the caption font"));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadCaptionFont()
      .then(() => {
        setReady(true);
        continueRender(handle);
      })
      .catch((error: unknown) => cancelRender(error));
  }, [handle, continueRender, cancelRender]);

  return ready;
}
