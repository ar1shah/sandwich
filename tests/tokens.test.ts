import { describe, expect, it } from "vitest";
import { resolveTokens, tokenizeProductNames } from "../src/shared/tokens";

const jeans = {
  fullName: "Levi's 501 Original Fit Jeans",
  shortName: "the 501s",
};

describe("resolveTokens (SPEC section 2 examples)", () => {
  it("10/10 {product} -> 10/10 the 501s", () => {
    expect(resolveTokens("10/10 {product}", jeans)).toEqual({
      text: "10/10 the 501s",
      unknownTokens: [],
    });
  });

  it("{product} changed my whole wardrobe", () => {
    expect(
      resolveTokens("{product} changed my whole wardrobe", jeans).text,
    ).toBe("the 501s changed my whole wardrobe");
  });

  it("text without tokens is unchanged", () => {
    expect(resolveTokens("4 weeks later", jeans)).toEqual({
      text: "4 weeks later",
      unknownTokens: [],
    });
  });
});

describe("resolveTokens", () => {
  it("{short} is an alias of {product}", () => {
    expect(resolveTokens("{short}", jeans).text).toBe("the 501s");
  });

  it("{full} is always the full name", () => {
    expect(resolveTokens("get {full}", jeans).text).toBe(
      "get Levi's 501 Original Fit Jeans",
    );
  });

  it("falls back to the full name when short_name is empty, blank or missing", () => {
    for (const shortName of ["", "   ", null, undefined]) {
      const p = { fullName: "Glow Serum", shortName };
      expect(resolveTokens("{product}|{short}|{full}", p).text).toBe(
        "Glow Serum|Glow Serum|Glow Serum",
      );
    }
  });

  it("trims the short name", () => {
    expect(
      resolveTokens("{product}", { fullName: "X", shortName: "  the x " }).text,
    ).toBe("the x");
  });

  it("resolves repeated tokens", () => {
    expect(resolveTokens("{product}, {product}, {full}", jeans).text).toBe(
      "the 501s, the 501s, Levi's 501 Original Fit Jeans",
    );
  });

  it("matches token names case-insensitively", () => {
    expect(resolveTokens("{Product} {FULL} {Short}", jeans).text).toBe(
      "the 501s Levi's 501 Original Fit Jeans the 501s",
    );
  });

  it("leaves unknown tokens as typed and reports each once", () => {
    const r = resolveTokens("{brand} {product} {brand} {Price}", jeans);
    expect(r.text).toBe("{brand} the 501s {brand} {Price}");
    expect(r.unknownTokens).toEqual(["{brand}", "{Price}"]);
  });

  it("ignores braces that are not token-shaped", () => {
    const r = resolveTokens("{} { product } {1x} {a b}", jeans);
    expect(r.text).toBe("{} { product } {1x} {a b}");
    expect(r.unknownTokens).toEqual([]);
  });

  it("does not re-expand tokens inside product names or treat $ specially", () => {
    const p = { fullName: "Cash $& {full}", shortName: null };
    expect(resolveTokens("{product}", p).text).toBe("Cash $& {full}");
  });

  it("keeps line breaks", () => {
    expect(resolveTokens("a\n{product}", jeans).text).toBe("a\nthe 501s");
  });
});

describe("tokenizeProductNames (inverse of resolveTokens)", () => {
  it("full name becomes {full}, short name {product}", () => {
    expect(
      tokenizeProductNames(
        "the 501s are Levi's 501 Original Fit Jeans for me",
        jeans,
      ),
    ).toBe("{product} are {full} for me");
  });

  it("round trips text built from tokens", () => {
    for (const source of [
      "10/10 {product}",
      "{product} changed my whole wardrobe",
      "{full}, honestly. {product}!",
      "4 weeks later",
    ]) {
      const resolved = resolveTokens(source, jeans).text;
      expect(
        resolveTokens(tokenizeProductNames(resolved, jeans), jeans).text,
      ).toBe(resolved);
      expect(tokenizeProductNames(resolved, jeans)).toBe(source);
    }
  });

  it("without a short name the full name becomes {product}", () => {
    const plain = { fullName: "Levi's 501 Jeans", shortName: null };
    expect(tokenizeProductNames("I love Levi's 501 Jeans", plain)).toBe(
      "I love {product}",
    );
    expect(
      tokenizeProductNames("I love Levi's 501 Jeans", {
        fullName: "Levi's 501 Jeans",
        shortName: "  ",
      }),
    ).toBe("I love {product}");
  });

  it("replaces the longer name first when the short name sits inside the full name", () => {
    const product = { fullName: "Glow Serum Pro", shortName: "Serum" };
    expect(
      tokenizeProductNames("Glow Serum Pro is why this Serum works", product),
    ).toBe("{full} is why this {product} works");
  });

  it("matches case-insensitively on word boundaries only", () => {
    const product = { fullName: "Glow Serum Pro", shortName: "Serum" };
    expect(tokenizeProductNames("SERUM, serum. Serums", product)).toBe(
      "{product}, {product}. Serums",
    );
  });

  it("leaves text without a product name unchanged", () => {
    expect(tokenizeProductNames("4 weeks later {x}", jeans)).toBe(
      "4 weeks later {x}",
    );
  });

  it("does not treat regex characters in a name as syntax", () => {
    const product = { fullName: "C++ (Pro) Kit", shortName: "the kit?" };
    expect(
      tokenizeProductNames("I use C++ (Pro) Kit and the kit?", product),
    ).toBe("I use {full} and {product}");
  });
});
