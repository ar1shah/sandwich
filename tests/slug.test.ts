import { describe, expect, it } from "vitest";
import { isWindowsReservedName, slugify } from "../src/shared/slug";

describe("slugify", () => {
  it("lowercases and dashes words", () => {
    expect(slugify("Levi's 501 Original Fit Jeans")).toBe(
      "levis-501-original-fit-jeans",
    );
  });

  it("strips straight and curly apostrophes instead of dashing them", () => {
    expect(slugify("can't")).toBe("cant");
    expect(slugify("it’s")).toBe("its");
    expect(slugify("don‘t")).toBe("dont");
  });

  it("removes accents", () => {
    expect(slugify("Crème Brûlée Façade")).toBe("creme-brulee-facade");
    expect(slugify("Ñandú")).toBe("nandu");
  });

  it("transliterates letters NFKD does not decompose", () => {
    expect(slugify("Straße")).toBe("strasse");
    expect(slugify("Ærø Łódź")).toBe("aero-lodz");
  });

  it("drops emojis and symbols", () => {
    expect(slugify("love it 😍🔥 so much")).toBe("love-it-so-much");
    expect(slugify('10/10 <wow> | "ok"?')).toBe("10-10-wow-ok");
  });

  it("collapses runs of separators and trims dashes", () => {
    expect(slugify("  --hello___world--  ")).toBe("hello-world");
  });

  it("falls back when nothing usable is left", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("😍😍")).toBe("untitled");
    expect(slugify("😍", { fallback: "no-caption" })).toBe("no-caption");
    expect(slugify("", { fallback: "" })).toBe("");
  });

  it("caps length without leaving a trailing dash", () => {
    const slug = slugify("aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd", {
      maxLength: 21,
    });
    expect(slug).toBe("aaaaaaaaaa-bbbbbbbbbb");
    expect(slugify("aaaaaaaaaa bbbb", { maxLength: 11 })).toBe("aaaaaaaaaa");
    expect(slugify("abc", { maxLength: 0 })).toBe("untitled");
  });

  it("suffixes Windows reserved device names", () => {
    expect(slugify("CON")).toBe("con-1");
    expect(slugify("nul")).toBe("nul-1");
    expect(slugify("COM1")).toBe("com1-1");
    expect(slugify("lpt9")).toBe("lpt9-1");
    expect(slugify("console")).toBe("console");
    expect(isWindowsReservedName("Aux")).toBe(true);
    expect(isWindowsReservedName("aux1")).toBe(false);
  });

  it("only produces [a-z0-9-]", () => {
    expect(slugify("Ünï©ödé ✓ test.mp4")).toMatch(/^[a-z0-9-]+$/);
  });
});
