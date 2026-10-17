import { describe, expect, it } from "vitest";
import { AppSettingsSchema } from "../src/shared/library";
import {
  DEFAULT_EDITOR_SETTINGS,
  defaultsOutsideTarget,
  defaultTotal,
  resolveEditorSettings,
  snapSeconds,
  UpdateEditorSettingsSchema,
} from "../src/shared/settings";

describe("editor settings", () => {
  it("defaults to 3/4/5 s clips and an 11 to 15 s target", () => {
    expect(DEFAULT_EDITOR_SETTINGS.clipDurations).toEqual({
      before: 3,
      after: 4,
      broll: 5,
    });
    expect(DEFAULT_EDITOR_SETTINGS.targetRange).toEqual({ min: 11, max: 15 });
    expect(resolveEditorSettings({})).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it("resolves saved values over the defaults", () => {
    const resolved = resolveEditorSettings({
      clipDurations: { before: 2, after: 3, broll: 4 },
    });
    expect(resolved.clipDurations.before).toBe(2);
    expect(resolved.targetRange).toEqual({ min: 11, max: 15 });
  });

  it("snaps seconds to 0.1", () => {
    expect(snapSeconds(3.04)).toBe(3);
    expect(snapSeconds(3.06)).toBe(3.1);
    const parsed = UpdateEditorSettingsSchema.parse({
      clipDurations: { before: 3.04, after: 4.26, broll: 5 },
    });
    expect(parsed.clipDurations).toEqual({ before: 3, after: 4.3, broll: 5 });
  });

  it("rejects out-of-range lengths and an inverted target", () => {
    const bad = (value: unknown) =>
      UpdateEditorSettingsSchema.safeParse(value).success;
    expect(bad({ clipDurations: { before: 0, after: 4, broll: 5 } })).toBe(
      false,
    );
    expect(bad({ clipDurations: { before: 3, after: 61, broll: 5 } })).toBe(
      false,
    );
    expect(bad({ targetRange: { min: 15, max: 11 } })).toBe(false);
    expect(bad({ targetRange: { min: 11, max: 11 } })).toBe(false);
    expect(bad({ targetRange: { min: 11, max: 15 } })).toBe(true);
  });

  it("settings.update accepts editor fields only: libraryPath is rejected", () => {
    expect(
      UpdateEditorSettingsSchema.safeParse({ libraryPath: "/tmp/evil" })
        .success,
    ).toBe(false);
    expect(
      UpdateEditorSettingsSchema.safeParse({
        targetRange: { min: 11, max: 15 },
        libraryPath: "/tmp/evil",
      }).success,
    ).toBe(false);
    expect(UpdateEditorSettingsSchema.safeParse({}).success).toBe(true);
  });

  it("warns when three default clips miss the target", () => {
    expect(defaultTotal(DEFAULT_EDITOR_SETTINGS)).toBe(12);
    expect(defaultsOutsideTarget(DEFAULT_EDITOR_SETTINGS)).toBe(false);
    expect(
      defaultsOutsideTarget({
        ...DEFAULT_EDITOR_SETTINGS,
        clipDurations: { before: 1, after: 1, broll: 1 },
      }),
    ).toBe(true);
    expect(
      defaultsOutsideTarget({
        ...DEFAULT_EDITOR_SETTINGS,
        clipDurations: { before: 6, after: 6, broll: 6 },
      }),
    ).toBe(true);
  });
});

describe("AppSettingsSchema (settings.json)", () => {
  it("keeps libraryPath when an editor field is invalid", () => {
    const parsed = AppSettingsSchema.parse({
      libraryPath: "/lib",
      clipDurations: { before: -1, after: "x", broll: 5 },
      targetRange: { min: 20, max: 10 },
      openDrafts: "nonsense",
    });
    expect(parsed.libraryPath).toBe("/lib");
    expect(parsed.clipDurations).toBeUndefined();
    expect(parsed.targetRange).toBeUndefined();
    expect(parsed.openDrafts).toBeUndefined();
  });

  it("reads valid editor fields", () => {
    const parsed = AppSettingsSchema.parse({
      libraryPath: "/lib",
      clipDurations: { before: 2, after: 3, broll: 4 },
      targetRange: { min: 9, max: 12 },
      openDrafts: { "/lib": "draft-1" },
    });
    expect(parsed.clipDurations?.after).toBe(3);
    expect(parsed.openDrafts).toEqual({ "/lib": "draft-1" });
  });
});
