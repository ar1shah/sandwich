import { describe, expect, it } from "vitest";
import {
  CAPTION_MAX_LINES,
  CAPTION_MIN_FONT_SIZE,
  CAPTION_READABLE_FONT_SIZE,
  CAPTION_START_FONT_SIZE,
  captionFit,
  computeCaptionLayout,
  placeCaptionBlock,
  wrapText,
  type MeasureWidth,
} from "../src/shared/captionLayout";
import { safeRect } from "../src/shared/safeZone";

// Every character is 0.5 em wide, so width = chars * fontSize / 2.
const measure: MeasureWidth = (text, fontSize) => text.length * fontSize * 0.5;

describe("wrapText", () => {
  it("keeps short text on one line", () => {
    expect(wrapText("hello world", 1000, 20, measure)).toEqual(["hello world"]);
  });

  it("wraps greedily at the max width", () => {
    // 10 chars per line at 20 px with maxWidth 100.
    expect(wrapText("aaaa bbbb cccc dddd", 100, 20, measure)).toEqual([
      "aaaa bbbb",
      "cccc dddd",
    ]);
  });

  it("honours explicit line breaks and CRLF", () => {
    expect(wrapText("one\ntwo\r\nthree", 1000, 20, measure)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("keeps interior blank lines and drops leading and trailing ones", () => {
    expect(wrapText("\n\na\n\nb\n\n", 1000, 20, measure)).toEqual([
      "a",
      "",
      "b",
    ]);
  });

  it("collapses runs of whitespace", () => {
    expect(wrapText("a    b", 1000, 20, measure)).toEqual(["a b"]);
  });

  it("returns no lines for empty or blank text", () => {
    expect(wrapText("", 100, 20, measure)).toEqual([]);
    expect(wrapText("  \n ", 100, 20, measure)).toEqual([]);
  });

  it("hard-breaks a word wider than the line", () => {
    const lines = wrapText("abcdefghijklmnopqrstuvwxyz", 100, 20, measure);
    expect(lines.join("")).toBe("abcdefghijklmnopqrstuvwxyz");
    expect(lines.every((line) => measure(line, 20) <= 100)).toBe(true);
    expect(lines.length).toBeGreaterThan(1);
  });

  it("hard-breaks after a partly filled line and keeps going", () => {
    const lines = wrapText("hi abcdefghijklmnopqrstuvwxyz", 100, 20, measure);
    expect(lines[0]).toBe("hi");
    expect(lines.slice(1).join("")).toBe("abcdefghijklmnopqrstuvwxyz");
  });

  it("does not loop forever when one character is wider than the line", () => {
    expect(wrapText("abc", 1, 20, measure)).toEqual(["a", "b", "c"]);
  });
});

describe("computeCaptionLayout", () => {
  const base = { maxWidth: 674, maxHeight: 1000, measureWidth: measure };

  it("uses the start size when the text fits", () => {
    const layout = computeCaptionLayout({ ...base, text: "4 weeks later" });
    expect(layout).toEqual({
      lines: ["4 weeks later"],
      fontSize: CAPTION_START_FONT_SIZE,
      overflow: false,
    });
  });

  it("shrinks until the text fits in 3 lines", () => {
    const text =
      "Tap the yellow basket to grab it before it sells out again this weekend";
    const layout = computeCaptionLayout({ ...base, text });
    expect(layout.overflow).toBe(false);
    expect(layout.lines.length).toBeLessThanOrEqual(CAPTION_MAX_LINES);
    expect(layout.fontSize).toBeLessThan(CAPTION_START_FONT_SIZE);
    expect(layout.fontSize).toBeGreaterThanOrEqual(CAPTION_MIN_FONT_SIZE);
    expect(layout.lines.join(" ")).toBe(text);
    // One step larger would not have fit.
    const larger = computeCaptionLayout({
      ...base,
      text,
      startFontSize: layout.fontSize + 2,
      minFontSize: layout.fontSize + 2,
    });
    expect(larger.overflow).toBe(true);
  });

  it("keeps the floor size, every line, and flags overflow when 3 lines are not enough", () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const layout = computeCaptionLayout({ ...base, text });
    expect(layout.fontSize).toBe(CAPTION_MIN_FONT_SIZE);
    expect(layout.overflow).toBe(true);
    expect(layout.lines.length).toBeGreaterThan(CAPTION_MAX_LINES);
    expect(layout.lines.join(" ")).toBe(text);
  });

  it("flags overflow when the block is taller than maxHeight at the floor", () => {
    const layout = computeCaptionLayout({
      ...base,
      maxHeight: 50,
      text: "one\ntwo",
    });
    expect(layout.fontSize).toBe(CAPTION_MIN_FONT_SIZE);
    expect(layout.overflow).toBe(true);
    expect(layout.lines).toEqual(["one", "two"]);
  });

  it("does not flag text that fits exactly at the floor", () => {
    const layout = computeCaptionLayout({
      ...base,
      text: "a b c",
      startFontSize: 36,
      minFontSize: 36,
    });
    expect(layout.overflow).toBe(false);
  });

  it("returns an empty layout for empty text", () => {
    expect(computeCaptionLayout({ ...base, text: "" })).toEqual({
      lines: [],
      fontSize: CAPTION_START_FONT_SIZE,
      overflow: false,
    });
  });

  it("respects explicit line breaks", () => {
    const layout = computeCaptionLayout({
      ...base,
      maxWidth: 1000,
      text: "Two weeks later\nlook at the difference",
    });
    expect(layout.lines).toEqual(["Two weeks later", "look at the difference"]);
    expect(layout.overflow).toBe(false);
  });
});

describe("placeCaptionBlock", () => {
  const safe = safeRect();

  it("centers a middle block in the safe rect", () => {
    const top = placeCaptionBlock("middle", safe, 200);
    expect(top + 100).toBeCloseTo(safe.y + safe.height / 2, 6);
  });

  it("centers a top block in the upper third of the safe rect", () => {
    const top = placeCaptionBlock("top", safe, 200);
    expect(top).toBeGreaterThanOrEqual(safe.y);
    expect(top + 200).toBeLessThanOrEqual(safe.y + safe.height / 3);
  });

  it("clamps a tall top block so it stays inside the safe rect", () => {
    const top = placeCaptionBlock("top", safe, 900);
    expect(top).toBe(safe.y);
    expect(top + 900).toBeLessThanOrEqual(safe.y + safe.height);
  });

  it("starts a block taller than the rect at the rect's top", () => {
    expect(placeCaptionBlock("middle", safe, safe.height + 300)).toBe(safe.y);
  });
});

describe("captionFit", () => {
  it("is ok at and above the readable size", () => {
    expect(captionFit({ fontSize: 64, overflow: false })).toBe("ok");
    expect(
      captionFit({ fontSize: CAPTION_READABLE_FONT_SIZE, overflow: false }),
    ).toBe("ok");
  });

  it("is small just below the readable size, down to the floor", () => {
    expect(
      captionFit({
        fontSize: CAPTION_READABLE_FONT_SIZE - 2,
        overflow: false,
      }),
    ).toBe("small");
    expect(
      captionFit({ fontSize: CAPTION_MIN_FONT_SIZE, overflow: false }),
    ).toBe("small");
  });

  it("overflow wins over size", () => {
    expect(
      captionFit({ fontSize: CAPTION_MIN_FONT_SIZE, overflow: true }),
    ).toBe("overflow");
    expect(captionFit({ fontSize: 64, overflow: true })).toBe("overflow");
  });
});
