import { describe, expect, it } from "vitest";
import {
  BULK_ADD_MAX,
  BulkAddCaptionsInputSchema,
  CAPTION_TEXT_MAX,
  CreateCaptionInputSchema,
  UpdateCaptionInputSchema,
  isDuplicateCaption,
  normalizeCaptionText,
  unknownTokens,
} from "../src/shared/captions";

describe("caption schemas", () => {
  it("trims the text and accepts generic (null product)", () => {
    const parsed = CreateCaptionInputSchema.parse({
      text: "  4 weeks later  ",
      slot: "after",
      productId: null,
    });
    expect(parsed).toEqual({
      text: "4 weeks later",
      slot: "after",
      productId: null,
    });
  });

  it("rejects empty text, an unknown slot and text over the cap", () => {
    const base = { slot: "any", productId: null };
    expect(
      CreateCaptionInputSchema.safeParse({ ...base, text: "   " }).success,
    ).toBe(false);
    expect(
      CreateCaptionInputSchema.safeParse({
        text: "x",
        slot: "hook",
        productId: null,
      }).success,
    ).toBe(false);
    expect(
      CreateCaptionInputSchema.safeParse({
        ...base,
        text: "a".repeat(CAPTION_TEXT_MAX),
      }).success,
    ).toBe(true);
    expect(
      CreateCaptionInputSchema.safeParse({
        ...base,
        text: "a".repeat(CAPTION_TEXT_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("an update patch may leave fields out, and null product means generic", () => {
    expect(
      UpdateCaptionInputSchema.parse({ id: "c1", patch: { text: " hi " } }),
    ).toEqual({ id: "c1", patch: { text: "hi" } });
    expect(
      UpdateCaptionInputSchema.parse({ id: "c1", patch: { productId: null } })
        .patch.productId,
    ).toBeNull();
  });

  it("bulk add needs 1 to 200 valid items", () => {
    const item = { slot: "any", text: "x" } as const;
    const ok = (n: number) =>
      BulkAddCaptionsInputSchema.safeParse({
        productId: null,
        items: Array.from({ length: n }, () => item),
      }).success;
    expect(ok(0)).toBe(false);
    expect(ok(1)).toBe(true);
    expect(ok(BULK_ADD_MAX)).toBe(true);
    expect(ok(BULK_ADD_MAX + 1)).toBe(false);
  });
});

describe("unknownTokens", () => {
  it("lists tokens that are not product, short or full", () => {
    expect(unknownTokens("{product} {full} {short} {PRODUCT}")).toEqual([]);
    expect(unknownTokens("{brand} and {brand} and {price}")).toEqual([
      "{brand}",
      "{price}",
    ]);
  });
});

describe("duplicates", () => {
  it("normalizes case and whitespace, line breaks included", () => {
    expect(normalizeCaptionText("  4  Weeks\n later ")).toBe("4 weeks later");
  });

  it("matches on text, slot and product together", () => {
    const bank = [
      { text: "4 weeks later", slot: "after", productId: "p1" },
    ] as const;
    const dup = (
      text: string,
      slot: "after" | "before",
      productId: string | null,
    ) => isDuplicateCaption({ text, slot, productId }, bank);
    expect(dup("4 WEEKS   later", "after", "p1")).toBe(true);
    expect(dup("4 weeks later", "before", "p1")).toBe(false);
    expect(dup("4 weeks later", "after", "p2")).toBe(false);
    expect(dup("4 weeks later", "after", null)).toBe(false);
  });
});
