import type { Recipe, Slot } from "./recipe";

// Frame math for <SandwichVideo> (docs/reference/ARCHITECTURE.md section 2). Pure: the
// composition, calculateMetadata and the tests all read the same numbers from here.

// Float slack when turning seconds into whole frames (sourceDuration * fps).
const FRAME_EPSILON = 1e-6;

export type ClipTimeline = {
  slot: Slot;
  from: number; // frame the clip's <Sequence> starts at
  durationInFrames: number; // always >= 1
  trimBeforeFrames: number; // first source frame that plays
};

export type Timeline = {
  clips: [ClipTimeline, ClipTimeline, ClipTimeline];
  totalFrames: number; // always the sum of the clips' durationInFrames
};

// Clip boundaries are round(cumulative seconds * fps) and clip lengths are the
// differences, so rounding error never accumulates: the total equals
// round(totalDuration * fps) unless a clip is pushed up to the 1 frame floor (a clip
// shorter than half a frame), in which case the floor wins and the total grows.
export function buildTimeline(
  recipe: Pick<Recipe, "clips">,
  fps: number,
): Timeline {
  let cumulativeSeconds = 0;
  let boundary = 0;

  const clips = recipe.clips.map((clip): ClipTimeline => {
    cumulativeSeconds += clip.duration;
    const from = boundary;
    boundary = Math.max(Math.round(cumulativeSeconds * fps), from + 1);
    const durationInFrames = boundary - from;

    // Keep the whole window inside the source, even if rounding pushed it past the end.
    const sourceFrames = Math.floor(clip.sourceDuration * fps + FRAME_EPSILON);
    const trimBeforeFrames =
      clip.mediaPath === ""
        ? 0
        : Math.min(
            Math.round(clip.trimStart * fps),
            Math.max(0, sourceFrames - durationInFrames),
          );

    return { slot: clip.slot, from, durationInFrames, trimBeforeFrames };
  });

  return {
    clips: clips as Timeline["clips"],
    totalFrames: boundary,
  };
}
