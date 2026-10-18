// What the History page shows for each video row. Pure.
import { filledSlots } from "./editorRecipe";
import type { Product, Video, VideoStatus } from "./library";
import { totalSeconds } from "./lengthStatus";
import { parseDraftRecipe } from "./drafts";
import type { ExportFileState } from "./videos";

export type VideoSummary = {
  id: string;
  productId: string;
  status: VideoStatus;
  updatedAt: string;
  // false = the recipe could not be read; only Delete makes sense.
  readable: boolean;
  filledSlots: number;
  // Frame-based length of the exported file (what the render produces).
  duration: number;
  // Exported rows: the mp4's file name, from the library-relative export path.
  fileName: string | null;
  // The Before clip's library-relative path, for its thumbnail. null = empty slot or
  // unreadable recipe.
  beforeMediaPath: string | null;
};

export function summarizeVideo(
  video: Pick<
    Video,
    "id" | "productId" | "status" | "recipeJson" | "updatedAt" | "exportPath"
  >,
): VideoSummary {
  const recipe = parseDraftRecipe(video.recipeJson);
  const before = recipe?.clips[0].mediaPath ?? "";
  return {
    id: video.id,
    productId: video.productId,
    status: video.status,
    updatedAt: video.updatedAt,
    readable: recipe !== null,
    filledSlots: recipe ? filledSlots(recipe) : 0,
    duration: recipe ? totalSeconds(recipe, recipe.output.fps) : 0,
    fileName: video.exportPath
      ? (video.exportPath.split("/").pop() ?? video.exportPath)
      : null,
    beforeMediaPath: before === "" ? null : before,
  };
}

export type HistoryGroup = {
  productId: string;
  productName: string;
  archived: boolean;
  // Newest updatedAt in the group; groups are ordered by it.
  latestAt: string;
  videos: VideoSummary[];
};

export const UNKNOWN_PRODUCT_NAME = "Unknown product";

// Newest first. ISO 8601 UTC strings sort the same as the times they stand for.
function newestFirst(a: VideoSummary, b: VideoSummary): number {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt < b.updatedAt ? 1 : -1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function groupByProduct(
  videos: readonly VideoSummary[],
  products: readonly Pick<Product, "id" | "fullName" | "archivedAt">[],
): HistoryGroup[] {
  const byProduct = new Map<string, VideoSummary[]>();
  for (const video of videos) {
    const list = byProduct.get(video.productId);
    if (list) {
      list.push(video);
    } else {
      byProduct.set(video.productId, [video]);
    }
  }
  const groups = [...byProduct.entries()].map(
    ([productId, list]): HistoryGroup => {
      const product = products.find((p) => p.id === productId);
      const sorted = [...list].sort(newestFirst);
      return {
        productId,
        productName: product?.fullName ?? UNKNOWN_PRODUCT_NAME,
        archived: product ? product.archivedAt !== null : false,
        latestAt: sorted[0]?.updatedAt ?? "",
        videos: sorted,
      };
    },
  );
  return groups.sort((a, b) =>
    a.latestAt !== b.latestAt
      ? a.latestAt < b.latestAt
        ? 1
        : -1
      : a.productName.localeCompare(b.productName),
  );
}

export type HistoryBadge = "Draft" | "Exported" | "Failed" | "File missing";

// An exported row whose file is gone is called out; every other row reads as its status.
// `file` is undefined until the file check has answered (then the row reads as exported).
export function historyBadge(
  summary: Pick<VideoSummary, "status">,
  file: ExportFileState | undefined,
): HistoryBadge {
  switch (summary.status) {
    case "draft":
      return "Draft";
    case "failed":
      return "Failed";
    case "exported":
      return file === "missing" ? "File missing" : "Exported";
  }
}

// What the first line of a row says: the export's file name, else what the row is.
export function historyTitle(
  summary: Pick<VideoSummary, "status" | "readable" | "fileName">,
): string {
  if (!summary.readable) {
    return "Unreadable draft";
  }
  if (summary.status === "exported" && summary.fileName) {
    return summary.fileName;
  }
  return summary.status === "failed" ? "Failed export" : "Draft";
}
