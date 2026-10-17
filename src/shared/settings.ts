// Editor settings: default clip lengths and the target total range. Stored in
// <userData>/settings.json next to libraryPath (see AppSettingsSchema in library.ts).
import { z } from "zod";
import { DEFAULT_CLIP_DURATIONS, type Slot } from "./recipe";

export const CLIP_DURATION_MIN = 0.1;
export const CLIP_DURATION_MAX = 60;
export const TARGET_TOTAL_MAX = 300;

// Lengths are edited in 0.1 s steps (the trim UI snaps to the same grid).
export function snapSeconds(value: number): number {
  return Math.round(value * 10) / 10;
}

const clipSeconds = z
  .number()
  .min(CLIP_DURATION_MIN, `At least ${CLIP_DURATION_MIN} s.`)
  .max(CLIP_DURATION_MAX, `At most ${CLIP_DURATION_MAX} s.`)
  .transform(snapSeconds);

export const ClipDurationsSchema = z.object({
  before: clipSeconds,
  after: clipSeconds,
  broll: clipSeconds,
});

export const TargetRangeSchema = z
  .object({
    min: z.number().min(CLIP_DURATION_MIN).max(TARGET_TOTAL_MAX),
    max: z.number().min(CLIP_DURATION_MIN).max(TARGET_TOTAL_MAX),
  })
  .transform((range) => ({
    min: snapSeconds(range.min),
    max: snapSeconds(range.max),
  }))
  .refine((range) => range.min < range.max, {
    message: "The shortest total must be less than the longest.",
  });

export type EditorSettings = {
  clipDurations: Record<Slot, number>;
  targetRange: { min: number; max: number };
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  clipDurations: { ...DEFAULT_CLIP_DURATIONS },
  targetRange: { min: 11, max: 15 },
};

// What settings.update accepts. Strict on purpose: the renderer can change these two
// fields and nothing else, never libraryPath (DECISIONS #28).
export const UpdateEditorSettingsSchema = z
  .object({
    clipDurations: ClipDurationsSchema.optional(),
    targetRange: TargetRangeSchema.optional(),
  })
  .strict();
export type UpdateEditorSettings = z.input<typeof UpdateEditorSettingsSchema>;

// Raw values from settings.json (each may be missing) -> a full settings object.
export function resolveEditorSettings(raw: {
  clipDurations?: Record<Slot, number>;
  targetRange?: { min: number; max: number };
}): EditorSettings {
  return {
    clipDurations: raw.clipDurations ?? {
      ...DEFAULT_EDITOR_SETTINGS.clipDurations,
    },
    targetRange: raw.targetRange ?? { ...DEFAULT_EDITOR_SETTINGS.targetRange },
  };
}

export function defaultTotal(settings: EditorSettings): number {
  const { before, after, broll } = settings.clipDurations;
  return snapSeconds(before + after + broll);
}

// True when a video made of three default-length clips would miss the target range.
export function defaultsOutsideTarget(settings: EditorSettings): boolean {
  const total = defaultTotal(settings);
  return total < settings.targetRange.min || total > settings.targetRange.max;
}
