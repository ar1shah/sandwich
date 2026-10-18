import { describe, expect, it } from "vitest";
import {
  groupByProduct,
  historyBadge,
  historyTitle,
  summarizeVideo,
  UNKNOWN_PRODUCT_NAME,
  type VideoSummary,
} from "../src/shared/history";
import { emptyRecipe, recipeWithBefore } from "./helpers/recipe";

const row = (
  recipeJson: string,
  overrides: Partial<Parameters<typeof summarizeVideo>[0]> = {},
) =>
  summarizeVideo({
    id: "v1",
    productId: "p1",
    status: "draft",
    recipeJson,
    updatedAt: "2026-10-17T00:00:00.000Z",
    exportPath: null,
    ...overrides,
  });

const summary = (overrides: Partial<VideoSummary>): VideoSummary => ({
  id: "v",
  productId: "p1",
  status: "draft",
  updatedAt: "2026-10-17T00:00:00.000Z",
  readable: true,
  filledSlots: 3,
  duration: 12,
  fileName: null,
  beforeMediaPath: null,
  ...overrides,
});

describe("summarizeVideo", () => {
  it("reports slots, frame-based length and the Before clip path", () => {
    const result = row(JSON.stringify(recipeWithBefore()));
    expect(result).toMatchObject({
      readable: true,
      filledSlots: 1,
      duration: 12,
      beforeMediaPath: "clips/2026-10/a.mp4",
      fileName: null,
    });
  });

  it("has no Before path for an empty slot", () => {
    expect(row(JSON.stringify(emptyRecipe())).beforeMediaPath).toBeNull();
  });

  it("takes the file name from the library-relative export path", () => {
    const result = row(JSON.stringify(recipeWithBefore()), {
      status: "exported",
      exportPath: "exports/aloe/2026-10-17/aloe_hook_2026-10-17_01.mp4",
    });
    expect(result.fileName).toBe("aloe_hook_2026-10-17_01.mp4");
  });

  it("flags an unreadable recipe", () => {
    expect(row("{oops")).toMatchObject({
      readable: false,
      filledSlots: 0,
      duration: 0,
      beforeMediaPath: null,
    });
  });
});

describe("groupByProduct", () => {
  const products = [
    { id: "p1", fullName: "Aloe Gel", archivedAt: null },
    {
      id: "p2",
      fullName: "Zinc Cream",
      archivedAt: "2026-10-01T00:00:00.000Z",
    },
  ];

  it("groups by product, newest group first, newest row first", () => {
    const groups = groupByProduct(
      [
        summary({
          id: "a",
          productId: "p1",
          updatedAt: "2026-10-10T00:00:00Z",
        }),
        summary({
          id: "b",
          productId: "p2",
          updatedAt: "2026-10-15T00:00:00Z",
        }),
        summary({
          id: "c",
          productId: "p1",
          updatedAt: "2026-10-12T00:00:00Z",
        }),
      ],
      products,
    );
    expect(groups.map((g) => g.productName)).toEqual([
      "Zinc Cream",
      "Aloe Gel",
    ]);
    expect(groups[1]?.videos.map((v) => v.id)).toEqual(["c", "a"]);
    expect(groups[0]?.archived).toBe(true);
    expect(groups[1]?.archived).toBe(false);
  });

  it("falls back to Unknown product", () => {
    const [group] = groupByProduct([summary({ productId: "gone" })], products);
    expect(group?.productName).toBe(UNKNOWN_PRODUCT_NAME);
    expect(group?.archived).toBe(false);
  });

  it("breaks ties by id so the order is stable", () => {
    const same = "2026-10-10T00:00:00Z";
    const [group] = groupByProduct(
      [
        summary({ id: "b", updatedAt: same }),
        summary({ id: "a", updatedAt: same }),
      ],
      products,
    );
    expect(group?.videos.map((v) => v.id)).toEqual(["a", "b"]);
  });

  it("returns nothing for no videos", () => {
    expect(groupByProduct([], products)).toEqual([]);
  });
});

describe("historyBadge / historyTitle", () => {
  it("labels each status", () => {
    expect(historyBadge({ status: "draft" }, undefined)).toBe("Draft");
    expect(historyBadge({ status: "failed" }, undefined)).toBe("Failed");
    expect(historyBadge({ status: "exported" }, "present")).toBe("Exported");
    expect(historyBadge({ status: "exported" }, undefined)).toBe("Exported");
  });

  it("calls out an exported row whose file is gone", () => {
    expect(historyBadge({ status: "exported" }, "missing")).toBe(
      "File missing",
    );
  });

  it("titles rows by file name, else by what they are", () => {
    expect(
      historyTitle({
        status: "exported",
        readable: true,
        fileName: "x_01.mp4",
      }),
    ).toBe("x_01.mp4");
    expect(
      historyTitle({ status: "draft", readable: true, fileName: null }),
    ).toBe("Draft");
    expect(
      historyTitle({ status: "failed", readable: true, fileName: null }),
    ).toBe("Failed export");
    expect(
      historyTitle({ status: "draft", readable: false, fileName: null }),
    ).toBe("Unreadable draft");
  });
});
