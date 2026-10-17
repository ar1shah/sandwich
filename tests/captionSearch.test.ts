import { describe, expect, it } from "vitest";
import {
  captionsForProduct,
  filterCaptionList,
  matchesQuery,
  type SearchableCaption,
} from "../src/shared/captionSearch";

type C = SearchableCaption & { id: string };
const c = (
  id: string,
  slot: C["slot"],
  productId: string | null,
  createdAt: string,
  text = id,
): C => ({ id, slot, productId, createdAt, text });

// Oldest first, like the repo returns them.
const bank: C[] = [
  c("g-any", "any", null, "2026-01-01T00:00:00Z", "10/10 {product}"),
  c("p1-before", "before", "p1", "2026-01-02T00:00:00Z", "my smile lines"),
  c("p1-after-a", "after", "p1", "2026-01-03T00:00:00Z"),
  c("p1-after-b", "after", "p1", "2026-01-03T00:00:00Z"),
  c("p2-after", "after", "p2", "2026-01-04T00:00:00Z"),
];
const ids = (list: C[]) => list.map((x) => x.id);

describe("filterCaptionList", () => {
  it("returns everything newest first, keeping paste order inside a batch", () => {
    expect(
      ids(
        filterCaptionList(bank, {
          slot: "all",
          product: { kind: "all" },
          query: "",
        }),
      ),
    ).toEqual(["p2-after", "p1-after-a", "p1-after-b", "p1-before", "g-any"]);
  });

  it("filters by slot and by product, generic only, or all", () => {
    const after = filterCaptionList(bank, {
      slot: "after",
      product: { kind: "product", id: "p1" },
      query: "",
    });
    expect(ids(after)).toEqual(["p1-after-a", "p1-after-b"]);
    const generic = filterCaptionList(bank, {
      slot: "all",
      product: { kind: "generic" },
      query: "",
    });
    expect(ids(generic)).toEqual(["g-any"]);
  });

  it("searches the text, every word, any case", () => {
    const hit = filterCaptionList(bank, {
      slot: "all",
      product: { kind: "all" },
      query: "SMILE lines",
    });
    expect(ids(hit)).toEqual(["p1-before"]);
  });

  it("does not mutate its input", () => {
    const copy = [...bank];
    filterCaptionList(bank, {
      slot: "all",
      product: { kind: "all" },
      query: "",
    });
    expect(bank).toEqual(copy);
  });
});

describe("matchesQuery", () => {
  it("matches the stored or the resolved text", () => {
    expect(matchesQuery("501s", "10/10 {product}", "10/10 the 501s")).toBe(
      true,
    );
    expect(matchesQuery("501s", "10/10 {product}", null)).toBe(false);
    expect(matchesQuery("  ", "anything")).toBe(true);
  });
});

describe("captionsForProduct", () => {
  it("puts the product's own captions first, then generic ones, never other products", () => {
    expect(ids(captionsForProduct(bank, "p1"))).toEqual([
      "p1-after-a",
      "p1-after-b",
      "p1-before",
      "g-any",
    ]);
  });
});
