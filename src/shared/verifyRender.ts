import type { RgbStats } from "./frameStats";
import type { ClipSpec, Recipe, Slot } from "./recipe";
import { buildTimeline } from "./timeline";

// Pure planning and judging helpers for scripts/verify-render.ts. The script owns the
// ffmpeg calls; everything that decides pass or fail lives here so it can be unit tested.

// Per-clip audio windows are shrunk by this much at both ends so AAC frame boundaries and the
// neighbouring clip's audio cannot cause false failures.
export const AUDIO_WINDOW_INSET_SECONDS = 0.1;
// Below this a window counts as silent (volumedetect prints about -91 dB for digital silence).
export const SILENT_MAX_DB = -60;
// A source window louder than this must come through in the output when the clip is unmuted.
export const SOURCE_AUDIBLE_MIN_DB = -50;
// Largest allowed per-channel difference (0..255) between source and output centre patch.
// Measured on the real iPhone clip: a correct render differs by about 2 (x264 CRF 18), the
// same pixels decoded with the wrong (BT.601) matrix by about 7. 5 separates the two; the
// plan's 8 would let the wrong matrix through.
export const COLOUR_MAX_CHANNEL_DIFF = 5;
export const COLOUR_PATCH_SIZE = 64;

export type AudioWindow = {
  slot: Slot;
  muted: boolean;
  // Seconds in the rendered file, already inset.
  outputStart: number;
  outputLength: number;
  // Seconds in the normalized source (trimStart .. trimStart + duration), already inset.
  sourceStart: number;
  sourceLength: number;
};

export function planAudioWindows(
  recipe: Pick<Recipe, "clips">,
  fps: number,
  inset: number = AUDIO_WINDOW_INSET_SECONDS,
): AudioWindow[] {
  const timeline = buildTimeline(recipe, fps);
  return recipe.clips.map((clip, index) => {
    const planned = timeline.clips[index];
    if (!planned) {
      throw new Error(`No timeline entry for clip ${index}`);
    }
    const length = Math.max(0, planned.durationInFrames / fps - 2 * inset);
    return {
      slot: clip.slot,
      muted: clip.muted,
      outputStart: planned.from / fps + inset,
      outputLength: length,
      sourceStart: planned.trimBeforeFrames / fps + inset,
      sourceLength: length,
    };
  });
}

export type AudioVerdict = {
  status: "pass" | "info" | "fail";
  detail: string;
};

const fmtDb = (db: number | null): string =>
  db === null ? "n/a" : Number.isFinite(db) ? `${db} dB` : "-inf dB";

// outputDb / sourceDb are max_volume from volumedetect (null: could not measure).
export function judgeAudioWindow(
  window: Pick<AudioWindow, "muted">,
  outputDb: number | null,
  sourceDb: number | null,
): AudioVerdict {
  if (outputDb === null) {
    return { status: "fail", detail: "no volumedetect output for the render" };
  }
  const outputSilent = outputDb < SILENT_MAX_DB;
  if (window.muted) {
    return outputSilent
      ? { status: "pass", detail: `muted, silent (max ${fmtDb(outputDb)})` }
      : {
          status: "fail",
          detail: `muted but audible (max ${fmtDb(outputDb)})`,
        };
  }
  const sourceAudible = sourceDb !== null && sourceDb > SOURCE_AUDIBLE_MIN_DB;
  if (!outputSilent) {
    return { status: "pass", detail: `audible (max ${fmtDb(outputDb)})` };
  }
  if (sourceAudible) {
    return {
      status: "fail",
      detail: `source is audible (${fmtDb(sourceDb)}) but the render is silent (${fmtDb(outputDb)})`,
    };
  }
  return {
    status: "info",
    detail: `silent; source is silent here too (${fmtDb(sourceDb)})`,
  };
}

export type ColourClipPlan = {
  slot: Slot;
  sourcePath: string;
  // Seconds into the render and into the normalized source for the same frame.
  outputTime: number;
  sourceTime: number;
};

// A clip whose output frame is the source frame cover-fitted and nothing else: no zoom, a
// centred focus, and no middle caption over the sampled patch. Null when none qualifies.
export function planColourClip(
  recipe: Pick<Recipe, "clips">,
  fps: number,
): ColourClipPlan | null {
  const timeline = buildTimeline(recipe, fps);
  for (const [index, clip] of recipe.clips.entries()) {
    const planned = timeline.clips[index];
    if (!planned || !isColourComparable(clip)) {
      continue;
    }
    const half = Math.floor(planned.durationInFrames / 2);
    return {
      slot: clip.slot,
      sourcePath: clip.mediaPath,
      outputTime: (planned.from + half) / fps,
      sourceTime: (planned.trimBeforeFrames + half) / fps,
    };
  }
  return null;
}

function isColourComparable(clip: ClipSpec): boolean {
  return (
    clip.mediaPath !== "" &&
    clip.zoom === "none" &&
    clip.focus.x === 0.5 &&
    clip.focus.y === 0.5 &&
    (clip.caption === null || clip.caption.position !== "middle")
  );
}

export type ColourVerdict = {
  ok: boolean;
  maxDiff: number;
  diffs: { r: number; g: number; b: number };
};

export function compareColourPatches(
  source: RgbStats,
  output: RgbStats,
  maxDiff: number = COLOUR_MAX_CHANNEL_DIFF,
): ColourVerdict {
  const diffs = {
    r: Math.abs(source.r - output.r),
    g: Math.abs(source.g - output.g),
    b: Math.abs(source.b - output.b),
  };
  const worst = Math.max(diffs.r, diffs.g, diffs.b);
  return { ok: worst <= maxDiff, maxDiff: worst, diffs };
}
