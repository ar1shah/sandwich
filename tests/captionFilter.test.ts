import { describe, expect, it } from "vitest";
import {
  filterCaptions,
  type FilterableCaption,
} from "../src/shared/captionFilter";

type C = FilterableCaption & { id: string };
const c = (
  id: string,
  slot: C["slot"],
  productId: string | null,
  useCount = 0,
): C => ({ id, slot, productId, useCount });

const ids = (list: C[]): string[] => list.map((x) => x.id);

describe("filterCaptions", () => {
  const bank: C[] = [
    c("generic-before", "before", null),
    c("generic-any", "any", null),
    c("generic-after", "after", null),
    c("p1-before", "before", "p1"),
    c("p1-any", "any", "p1"),
    c("p1-broll", "broll", "p1"),
    c("p2-before", "before", "p2"),
  ];

  it("keeps slot X or any, and product P or generic", () => {
    expect(
      ids(filterCaptions(bank, { slot: "before", productId: "p1" })).sort(),
    ).toEqual(["generic-any", "generic-before", "p1-any", "p1-before"].sort());
  });

  it("excludes other products and other slots", () => {
    const out = ids(filterCaptions(bank, { slot: "broll", productId: "p1" }));
    expect(out).toContain("p1-broll");
    expect(out).not.toContain("p2-before");
    expect(out).not.toContain("generic-after");
    expect(out).not.toContain("p1-before");
  });

  it("puts product-specific captions first", () => {
    const out = ids(filterCaptions(bank, { slot: "before", productId: "p1" }));
    expect(out.slice(0, 2).sort()).toEqual(["p1-any", "p1-before"]);
    expect(out.slice(2).sort()).toEqual(["generic-any", "generic-before"]);
  });

  it("sorts by use count within each group, most used first", () => {
    const list = [
      c("g-low", "any", null, 1),
      c("g-high", "any", null, 9),
      c("p-low", "any", "p1", 2),
      c("p-high", "any", "p1", 5),
    ];
    expect(
      ids(filterCaptions(list, { slot: "after", productId: "p1" })),
    ).toEqual(["p-high", "p-low", "g-high", "g-low"]);
  });

  it("keeps input order for ties", () => {
    const list = [
      c("a", "any", null, 3),
      c("b", "any", null, 3),
      c("c", "any", null, 3),
    ];
    expect(
      ids(filterCaptions(list, { slot: "before", productId: "p1" })),
    ).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input and handles an empty bank", () => {
    const copy = bank.slice();
    filterCaptions(bank, { slot: "before", productId: "p1" });
    expect(bank).toEqual(copy);
    expect(filterCaptions([], { slot: "before", productId: "p1" })).toEqual([]);
  });
});
