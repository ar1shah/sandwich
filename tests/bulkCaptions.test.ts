import { describe, expect, it } from "vitest";
import { validateBulkCaptions } from "../src/shared/bulkCaptions";
import { BULK_ADD_MAX, CAPTION_TEXT_MAX } from "../src/shared/captions";

const generic = { productId: null, existing: [] } as const;

describe("validateBulkCaptions", () => {
  it("sends only lines that will be stored, and keeps real line numbers", () => {
    const result = validateBulkCaptions(
      "before | one\n\nhook | bad slot\nafter | two",
      generic,
    );
    expect(result.items).toEqual([
      { slot: "before", text: "one" },
      { slot: "after", text: "two" },
    ]);
    expect(result.errors.map((e) => e.line)).toEqual([3]);
    expect(result.lines.map((l) => l.kind)).toEqual(["ok", "error", "ok"]);
  });

  it("flags text over the cap as an error with its line number", () => {
    const long = "a".repeat(CAPTION_TEXT_MAX + 1);
    const exact = "b".repeat(CAPTION_TEXT_MAX);
    const result = validateBulkCaptions(
      `any | ${exact}\nany | ${long}`,
      generic,
    );
    expect(result.items).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ line: 2 });
    expect(result.errors[0]?.message).toContain(String(CAPTION_TEXT_MAX + 1));
  });

  it("caps one batch at 200 items; the 201st line is an error that stays in the box", () => {
    const input = Array.from(
      { length: BULK_ADD_MAX + 1 },
      (_, i) => `any | caption ${i}`,
    ).join("\n");
    const result = validateBulkCaptions(input, generic);
    expect(result.items).toHaveLength(BULK_ADD_MAX);
    expect(result.errors.map((e) => e.line)).toEqual([BULK_ADD_MAX + 1]);
  });

  it("skips repeats inside the paste and points at the first line", () => {
    const result = validateBulkCaptions(
      "after | 4 weeks later\nafter |  4 WEEKS later \nbefore | 4 weeks later",
      generic,
    );
    expect(result.items).toEqual([
      { slot: "after", text: "4 weeks later" },
      { slot: "before", text: "4 weeks later" },
    ]);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]).toMatchObject({
      line: 2,
      of: 1,
      message: "Repeated on line 1.",
    });
  });

  it("skips captions already in the bank for the same slot and product only", () => {
    const existing = [
      { text: "10/10 {product}", slot: "any", productId: "p1" },
      { text: "other", slot: "any", productId: "p2" },
    ] as const;
    const forP1 = validateBulkCaptions("any | 10/10 {Product}\nany | other", {
      productId: "p1",
      existing,
    });
    expect(forP1.items).toEqual([{ slot: "any", text: "other" }]);
    expect(forP1.duplicates[0]).toMatchObject({
      line: 1,
      of: "bank",
      message: "Already in bank.",
    });
    // Generic batch: the p1 caption is a different product, so nothing is a duplicate.
    const forGeneric = validateBulkCaptions("any | 10/10 {product}", {
      productId: null,
      existing,
    });
    expect(forGeneric.items).toHaveLength(1);
  });

  it("allowDuplicates sends them anyway but still labels them", () => {
    const result = validateBulkCaptions("any | same\nany | same", {
      ...generic,
      allowDuplicates: true,
    });
    expect(result.items).toHaveLength(2);
    expect(result.duplicates).toHaveLength(1);
  });

  it("a duplicate does not use up a slot in the 200 limit unless allowed", () => {
    const lines = Array.from(
      { length: BULK_ADD_MAX },
      (_, i) => `any | caption ${i}`,
    );
    const result = validateBulkCaptions(
      [...lines, "any | caption 0"].join("\n"),
      generic,
    );
    expect(result.items).toHaveLength(BULK_ADD_MAX);
    expect(result.errors).toHaveLength(0);
    expect(result.duplicates).toHaveLength(1);
  });
});
