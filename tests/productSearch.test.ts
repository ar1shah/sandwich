import { describe, expect, it } from "vitest";
import { filterProducts, orderProducts } from "../src/shared/productSearch";

const products = [
  {
    id: "1",
    fullName: "Levi's 501 Original Fit Jeans",
    shortName: "the 501s",
    slug: "levis-501",
    lastUsedAt: null,
  },
  {
    id: "2",
    fullName: "Crème Brûlée Candle",
    shortName: null,
    slug: "creme-brulee-candle",
    lastUsedAt: null,
  },
  {
    id: "3",
    fullName: "Smile Line Patches",
    shortName: "patches",
    slug: "smile-patches",
    lastUsedAt: null,
  },
];

describe("filterProducts", () => {
  it("returns everything for an empty or blank query", () => {
    expect(filterProducts(products, "")).toHaveLength(3);
    expect(filterProducts(products, "   ")).toHaveLength(3);
  });

  it("matches the full name, short name and slug, ignoring case", () => {
    expect(filterProducts(products, "ORIGINAL").map((p) => p.id)).toEqual([
      "1",
    ]);
    expect(filterProducts(products, "501s").map((p) => p.id)).toEqual(["1"]);
    expect(filterProducts(products, "smile-patches").map((p) => p.id)).toEqual([
      "3",
    ]);
  });

  it("ignores accents in both directions", () => {
    expect(filterProducts(products, "creme brulee").map((p) => p.id)).toEqual([
      "2",
    ]);
    expect(filterProducts(products, "crème").map((p) => p.id)).toEqual(["2"]);
  });

  it("needs every term to match, in any order", () => {
    expect(filterProducts(products, "jeans 501").map((p) => p.id)).toEqual([
      "1",
    ]);
    expect(filterProducts(products, "jeans candle")).toEqual([]);
  });

  it("does not mutate or reorder its input", () => {
    const copy = [...products];
    filterProducts(products, "a");
    expect(products).toEqual(copy);
  });
});

describe("orderProducts", () => {
  it("puts recently used first (newest first), then names A to Z", () => {
    const ordered = orderProducts([
      { fullName: "Zebra", lastUsedAt: null },
      { fullName: "apple", lastUsedAt: null },
      { fullName: "Old", lastUsedAt: "2026-01-01T00:00:00.000Z" },
      { fullName: "New", lastUsedAt: "2026-02-01T00:00:00.000Z" },
    ]);
    expect(ordered.map((p) => p.fullName)).toEqual([
      "New",
      "Old",
      "apple",
      "Zebra",
    ]);
  });
});
