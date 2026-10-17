// Pure recipe edits for the editor shell. The store calls these; nothing here touches
// the DOM, the clock (it is passed in) or IPC.
import {
  SLOTS,
  type ClipCaption,
  type ClipSpec,
  type Recipe,
  type Slot,
} from "./recipe";

export type ClipMedia = {
  // Library-relative path of the normalized file.
  path: string;
  // Seconds, from the probe of the normalized file.
  duration: number;
};

export type SlotDurations = Record<Slot, number>;

function replaceClip(recipe: Recipe, slot: Slot, clip: ClipSpec, now: Date) {
  const clips = recipe.clips.map((current, index) =>
    index === SLOTS.indexOf(slot) ? clip : current,
  ) as Recipe["clips"];
  return { ...recipe, clips, updatedAt: now.toISOString() };
}

function clipOf(recipe: Recipe, slot: Slot): ClipSpec {
  return recipe.clips[SLOTS.indexOf(slot)];
}

// Puts a normalized clip into a slot. The trim starts at 0 and lasts the slot's default
// length, or the whole clip when it is shorter. Caption, zoom and mute choices survive
// a replacement; the focus point does not (it belongs to the old picture).
export function applyClipMedia(
  recipe: Recipe,
  slot: Slot,
  media: ClipMedia,
  defaults: SlotDurations,
  now: Date,
): Recipe {
  if (!(media.duration > 0)) {
    throw new Error("A clip needs a duration above zero.");
  }
  const current = clipOf(recipe, slot);
  return replaceClip(
    recipe,
    slot,
    {
      ...current,
      mediaPath: media.path,
      sourceDuration: media.duration,
      trimStart: 0,
      duration: Math.min(defaults[slot], media.duration),
      focus: { x: 0.5, y: 0.5 },
    },
    now,
  );
}

// Empties a slot. The caption, zoom and mute choices stay for the next clip.
export function clearClip(
  recipe: Recipe,
  slot: Slot,
  defaults: SlotDurations,
  now: Date,
): Recipe {
  return replaceClip(
    recipe,
    slot,
    {
      ...clipOf(recipe, slot),
      mediaPath: "",
      sourceDuration: 0,
      trimStart: 0,
      duration: defaults[slot],
      focus: { x: 0.5, y: 0.5 },
    },
    now,
  );
}

// Sets a slot's trim window (the caller clamps it with trimMath).
export function applyTrim(
  recipe: Recipe,
  slot: Slot,
  trim: { start: number; duration: number },
  now: Date,
): Recipe {
  return replaceClip(
    recipe,
    slot,
    { ...clipOf(recipe, slot), trimStart: trim.start, duration: trim.duration },
    now,
  );
}

// Zoom is a switch in the MVP: on = slow push, off = none. A recipe that holds another
// style (punch-in) reads as "on" and turning it off and on again gives slow push.
export function isZoomOn(clip: Pick<ClipSpec, "zoom">): boolean {
  return clip.zoom !== "none";
}

export function applyZoom(
  recipe: Recipe,
  slot: Slot,
  on: boolean,
  now: Date,
): Recipe {
  return replaceClip(
    recipe,
    slot,
    { ...clipOf(recipe, slot), zoom: on ? "slow-push" : "none" },
    now,
  );
}

export function applyMuted(
  recipe: Recipe,
  slot: Slot,
  muted: boolean,
  now: Date,
): Recipe {
  return replaceClip(recipe, slot, { ...clipOf(recipe, slot), muted }, now);
}

export type CaptionLook = Pick<ClipCaption, "style" | "position">;

export const FALLBACK_CAPTION_LOOK: CaptionLook = {
  style: "outline",
  position: "middle",
};

// The look a NEW caption gets: copied from another slot that already has a caption (before,
// then after, then broll), so a video keeps one look unless the user changes it. With none
// to copy it is outline / middle.
export function defaultCaptionLook(recipe: Recipe, slot: Slot): CaptionLook {
  for (const other of recipe.clips) {
    if (other.slot !== slot && other.caption) {
      return { style: other.caption.style, position: other.caption.position };
    }
  }
  return FALLBACK_CAPTION_LOOK;
}

// A caption keeps its look when the slot already has one; only a slot without a caption
// takes the default look.
function lookFor(recipe: Recipe, slot: Slot): CaptionLook {
  const existing = clipOf(recipe, slot).caption;
  return existing
    ? { style: existing.style, position: existing.position }
    : defaultCaptionLook(recipe, slot);
}

// Picking from the bank: the text is already token-resolved and `sourceCaptionId` records
// which bank row it started from (not that it is identical to it, DECISIONS #36).
export function applyCaptionPick(
  recipe: Recipe,
  slot: Slot,
  pick: { text: string; sourceCaptionId: string },
  now: Date,
): Recipe {
  return replaceClip(
    recipe,
    slot,
    {
      ...clipOf(recipe, slot),
      caption: {
        ...lookFor(recipe, slot),
        text: pick.text,
        sourceCaptionId: pick.sourceCaptionId,
      },
    },
    now,
  );
}

// Typing in the caption box. Typing with no caption yet creates one (default look, no
// source). Emptying the box keeps the caption object so its look survives; "Clear caption"
// is what removes it.
export function applyCaptionText(
  recipe: Recipe,
  slot: Slot,
  text: string,
  now: Date,
): Recipe {
  const existing = clipOf(recipe, slot).caption;
  return replaceClip(
    recipe,
    slot,
    {
      ...clipOf(recipe, slot),
      caption: existing
        ? { ...existing, text }
        : { ...lookFor(recipe, slot), text },
    },
    now,
  );
}

// Style / position of a slot's caption. Nothing to change without a caption.
export function applyCaptionLook(
  recipe: Recipe,
  slot: Slot,
  look: Partial<CaptionLook>,
  now: Date,
): Recipe {
  const existing = clipOf(recipe, slot).caption;
  if (!existing) {
    return recipe;
  }
  return replaceClip(
    recipe,
    slot,
    { ...clipOf(recipe, slot), caption: { ...existing, ...look } },
    now,
  );
}

// Re-points the caption at a bank row (after "Save to bank" created one from its text).
export function applySourceCaption(
  recipe: Recipe,
  slot: Slot,
  sourceCaptionId: string,
  now: Date,
): Recipe {
  const existing = clipOf(recipe, slot).caption;
  if (!existing) {
    return recipe;
  }
  return replaceClip(
    recipe,
    slot,
    { ...clipOf(recipe, slot), caption: { ...existing, sourceCaptionId } },
    now,
  );
}

export function clearCaption(recipe: Recipe, slot: Slot, now: Date): Recipe {
  return replaceClip(
    recipe,
    slot,
    { ...clipOf(recipe, slot), caption: null },
    now,
  );
}

export function draftHasMedia(recipe: Pick<Recipe, "clips">): boolean {
  return recipe.clips.some((clip) => clip.mediaPath !== "");
}

export function filledSlots(recipe: Pick<Recipe, "clips">): number {
  return recipe.clips.filter((clip) => clip.mediaPath !== "").length;
}

export type SlotStatus = "empty" | "importing" | "error" | "missing" | "ready";

// What a slot card shows. An import in flight wins (it will replace whatever is there),
// then an import error, then whether the clip's file still exists.
export function slotStatus(
  clip: Pick<ClipSpec, "mediaPath">,
  flags: { importing: boolean; error: boolean; missing: boolean },
): SlotStatus {
  if (flags.importing) {
    return "importing";
  }
  if (flags.error) {
    return "error";
  }
  if (clip.mediaPath === "") {
    return "empty";
  }
  return flags.missing ? "missing" : "ready";
}
