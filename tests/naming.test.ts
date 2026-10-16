import { describe, expect, it } from "vitest";
import {
  buildExportName,
  buildHook,
  formatLocalDate,
} from "../src/shared/naming";

// Local-time constructor on purpose: these tests must pass in any timezone.
const oct15 = new Date(2026, 9, 15, 10, 0);

describe("SPEC section 6 example", () => {
  it("levis-501_cant-fix-my-smile_2026-10-15_03.mp4", () => {
    const name = buildExportName({
      productSlug: "levis-501",
      beforeCaption: "I can't fix my smile lines, it's genetics",
      date: oct15,
      existingNames: [
        "levis-501_cant-fix-my-smile_2026-10-15_01.mp4",
        "levis-501_cant-fix-my-smile_2026-10-15_02.mp4",
      ],
    });
    expect(name).toEqual({
      folderSegments: ["exports", "levis-501", "2026-10-15"],
      fileName: "levis-501_cant-fix-my-smile_2026-10-15_03.mp4",
      sidecarName: "levis-501_cant-fix-my-smile_2026-10-15_03.recipe.json",
    });
  });
});

describe("formatLocalDate", () => {
  it("uses local calendar fields, so a late evening stays on the same day", () => {
    expect(formatLocalDate(new Date(2026, 9, 15, 23, 59, 59))).toBe(
      "2026-10-15",
    );
    expect(formatLocalDate(new Date(2026, 9, 15, 0, 0, 0))).toBe("2026-10-15");
  });

  it("zero-pads month and day", () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("buildHook", () => {
  it("skips single-letter words and takes the next 4", () => {
    expect(buildHook("I can't fix my smile lines, it's genetics")).toBe(
      "cant-fix-my-smile",
    );
    expect(buildHook("a b the best serum ever made")).toBe(
      "the-best-serum-ever",
    );
  });

  it("keeps single digits", () => {
    expect(buildHook("3 weeks into using this")).toBe("3-weeks-into-using");
    expect(buildHook("I tried this for 5 days")).toBe("tried-this-for-5");
  });

  it("skips emoji-only and symbol-only words", () => {
    expect(buildHook("😍 wow 🔥 this is great")).toBe("wow-this-is-great");
    expect(buildHook("- ! wow")).toBe("wow");
  });

  it("returns no-caption for empty or unusable captions", () => {
    expect(buildHook("")).toBe("no-caption");
    expect(buildHook("   \n ")).toBe("no-caption");
    expect(buildHook("I 😍 a")).toBe("no-caption");
  });

  it("takes fewer words when the caption is short", () => {
    expect(buildHook("wow")).toBe("wow");
  });

  it("caps at 30 chars with no trailing dash", () => {
    const hook = buildHook(
      "supercalifragilistic expialidocious wonderful great",
    );
    expect(hook).toBe("supercalifragilistic-expialido"); // hard cut at 30, mid-word is fine
    expect(hook.length).toBe(30);

    const cut = buildHook("aaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbb");
    expect(cut).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(cut.endsWith("-")).toBe(false);

    const exact = buildHook("aaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbb"); // 28 + dash + bb
    expect(exact).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaa-b");
    expect(exact.length).toBe(30);
  });

  it("works on resolved caption text with line breaks", () => {
    expect(buildHook("Two weeks later\nlook at the difference")).toBe(
      "two-weeks-later-look",
    );
  });
});

describe("buildExportName", () => {
  const base = { productSlug: "glow-serum", beforeCaption: "Wow", date: oct15 };

  it("starts the counter at 01 in an empty folder", () => {
    expect(buildExportName({ ...base, existingNames: [] }).fileName).toBe(
      "glow-serum_wow_2026-10-15_01.mp4",
    );
  });

  it("uses no-caption for an empty before caption", () => {
    expect(
      buildExportName({ ...base, beforeCaption: "", existingNames: [] })
        .fileName,
    ).toBe("glow-serum_no-caption_2026-10-15_01.mp4");
  });

  it("fills the first unused counter, even after a gap", () => {
    const taken = [
      "glow-serum_wow_2026-10-15_01.mp4",
      "glow-serum_wow_2026-10-15_03.mp4",
    ];
    expect(buildExportName({ ...base, existingNames: taken }).fileName).toBe(
      "glow-serum_wow_2026-10-15_02.mp4",
    );
  });

  it("treats a leftover sidecar as taken", () => {
    const taken = ["glow-serum_wow_2026-10-15_01.recipe.json"];
    expect(buildExportName({ ...base, existingNames: taken }).fileName).toBe(
      "glow-serum_wow_2026-10-15_02.mp4",
    );
  });

  it("matches existing names case-insensitively", () => {
    const taken = new Set(["GLOW-SERUM_WOW_2026-10-15_01.MP4"]);
    expect(buildExportName({ ...base, existingNames: taken }).fileName).toBe(
      "glow-serum_wow_2026-10-15_02.mp4",
    );
  });

  it("ignores other products, hooks and dates", () => {
    const taken = [
      "other_wow_2026-10-15_01.mp4",
      "glow-serum_other_2026-10-15_01.mp4",
      "glow-serum_wow_2026-10-14_01.mp4",
    ];
    expect(buildExportName({ ...base, existingNames: taken }).fileName).toBe(
      "glow-serum_wow_2026-10-15_01.mp4",
    );
  });

  it("goes past 99 to 100 instead of breaking", () => {
    const taken = Array.from(
      { length: 99 },
      (_, i) =>
        `glow-serum_wow_2026-10-15_${String(i + 1).padStart(2, "0")}.mp4`,
    );
    const name = buildExportName({ ...base, existingNames: taken });
    expect(name.fileName).toBe("glow-serum_wow_2026-10-15_100.mp4");
    expect(name.sidecarName).toBe("glow-serum_wow_2026-10-15_100.recipe.json");
  });

  it("names the folder with the local date, as segments", () => {
    const late = new Date(2026, 9, 15, 23, 45);
    expect(
      buildExportName({ ...base, date: late, existingNames: [] })
        .folderSegments,
    ).toEqual(["exports", "glow-serum", "2026-10-15"]);
  });

  it("produces names that are valid on Windows", () => {
    const { fileName, sidecarName } = buildExportName({
      ...base,
      beforeCaption: 'what? <is> "this": a|b*c',
      existingNames: [],
    });
    for (const n of [fileName, sidecarName]) {
      expect(n).not.toMatch(/[<>:"/\\|?*]/);
      expect(n).not.toMatch(/[. ]$/);
    }
  });
});
