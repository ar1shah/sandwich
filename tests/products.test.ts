import { describe, expect, it } from "vitest";
import {
  CreateProductInputSchema,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_SLUG_MAX,
  ProductFormSchema,
  ProductPatchSchema,
  slugConflict,
  slugConflictMessage,
  suggestSlug,
  uniqueSlug,
  UpdateProductInputSchema,
} from "../src/shared/products";

describe("ProductFormSchema", () => {
  it("trims and turns an empty short name into null", () => {
    const form = ProductFormSchema.parse({
      fullName: "  Levi's 501  ",
      shortName: "   ",
      slug: "levis-501",
    });
    expect(form).toEqual({
      fullName: "Levi's 501",
      shortName: null,
      slug: "levis-501",
    });
  });

  it("keeps a real short name", () => {
    const form = ProductFormSchema.parse({
      fullName: "Levi's 501",
      shortName: " the 501s ",
      slug: "levis-501",
    });
    expect(form.shortName).toBe("the 501s");
  });

  it("requires a full name", () => {
    const result = ProductFormSchema.safeParse({
      fullName: "  ",
      shortName: null,
      slug: "x",
    });
    expect(result.success).toBe(false);
  });

  it.each([
    "Has Caps",
    "has space",
    "-leading",
    "trailing-",
    "double--dash",
    "../escape",
    "emoji-😀",
    "",
    "con",
    "lpt1",
    "a".repeat(PRODUCT_SLUG_MAX + 1),
  ])("rejects the slug %j", (slug) => {
    expect(
      ProductFormSchema.safeParse({ fullName: "X", shortName: null, slug })
        .success,
    ).toBe(false);
  });

  it("accepts a slug at the length cap", () => {
    const slug = "a".repeat(PRODUCT_SLUG_MAX);
    expect(
      ProductFormSchema.safeParse({ fullName: "X", shortName: null, slug })
        .success,
    ).toBe(true);
  });
});

describe("ProductPatchSchema", () => {
  it("leaves missing fields missing, so a name change never touches the slug", () => {
    const patch = ProductPatchSchema.parse({ fullName: "New name" });
    expect(patch).toEqual({ fullName: "New name" });
    expect("slug" in patch).toBe(false);
    expect("shortName" in patch).toBe(false);
  });

  it("clears the short name with null or empty text", () => {
    expect(ProductPatchSchema.parse({ shortName: null }).shortName).toBeNull();
    expect(ProductPatchSchema.parse({ shortName: "  " }).shortName).toBeNull();
  });

  it("still validates the fields that are present", () => {
    expect(ProductPatchSchema.safeParse({ slug: "Bad Slug" }).success).toBe(
      false,
    );
  });
});

describe("image bytes", () => {
  const form = { fullName: "X", shortName: null, slug: "x" };

  it("accepts a Uint8Array (and a Buffer)", () => {
    expect(
      CreateProductInputSchema.safeParse({ form, image: new Uint8Array(3) })
        .success,
    ).toBe(true);
    expect(
      CreateProductInputSchema.safeParse({ form, image: Buffer.alloc(3) })
        .success,
    ).toBe(true);
  });

  it("rejects empty, oversized and non-binary images", () => {
    for (const image of [
      new Uint8Array(0),
      new Uint8Array(PRODUCT_IMAGE_MAX_BYTES + 1),
      "data:image/png;base64,AAAA",
      [1, 2, 3],
    ]) {
      expect(CreateProductInputSchema.safeParse({ form, image }).success).toBe(
        false,
      );
    }
  });

  it("update input needs an id", () => {
    expect(UpdateProductInputSchema.safeParse({ patch: {} }).success).toBe(
      false,
    );
    expect(
      UpdateProductInputSchema.safeParse({ id: "p1", patch: {} }).success,
    ).toBe(true);
  });
});

describe("suggestSlug", () => {
  it("slugifies the full name", () => {
    expect(suggestSlug("Levi's 501 Original Fit Jeans")).toBe(
      "levis-501-original-fit-jeans",
    );
  });

  it("caps the length without a trailing dash", () => {
    const slug = suggestSlug(`${"word ".repeat(30)}end`);
    expect(slug.length).toBeLessThanOrEqual(PRODUCT_SLUG_MAX);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back to 'product' when nothing usable is left", () => {
    expect(suggestSlug("😀😀")).toBe("product");
    expect(suggestSlug("")).toBe("product");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it is free", () => {
    expect(uniqueSlug("levis-501", ["other"])).toBe("levis-501");
  });

  it("walks -2, -3 until free", () => {
    expect(uniqueSlug("a", ["a"])).toBe("a-2");
    expect(uniqueSlug("a", ["a", "a-2", "a-3"])).toBe("a-4");
  });

  it("keeps the suffixed slug inside the length cap", () => {
    const base = "x".repeat(PRODUCT_SLUG_MAX);
    const next = uniqueSlug(base, [base]);
    expect(next.length).toBeLessThanOrEqual(PRODUCT_SLUG_MAX);
    expect(next.endsWith("-2")).toBe(true);
    const third = uniqueSlug(base, [base, next]);
    expect(third).not.toBe(next);
    expect(third.length).toBeLessThanOrEqual(PRODUCT_SLUG_MAX);
  });

  it("treats a slug of an archived product as taken (callers pass every slug)", () => {
    const products = [{ slug: "a", archivedAt: "2026-01-01T00:00:00.000Z" }];
    expect(
      uniqueSlug(
        "a",
        products.map((p) => p.slug),
      ),
    ).toBe("a-2");
  });
});

describe("slugConflict", () => {
  const products = [
    { id: "1", slug: "alpha", archivedAt: null },
    { id: "2", slug: "beta", archivedAt: "2026-01-01T00:00:00.000Z" },
  ];

  it("finds another product's slug", () => {
    expect(slugConflict("alpha", products)).toEqual({ archived: false });
  });

  it("flags when the owner is archived and words the message for it", () => {
    const conflict = slugConflict("beta", products);
    expect(conflict).toEqual({ archived: true });
    expect(slugConflictMessage(conflict!)).toMatch(/archived product/);
  });

  it("does not conflict with the product being edited", () => {
    expect(slugConflict("alpha", products, "1")).toBeNull();
  });

  it("is null for a free slug", () => {
    expect(slugConflict("gamma", products)).toBeNull();
  });
});
