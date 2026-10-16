export const RENDER_CANCELLED_MESSAGE = "Render cancelled.";

export type RenderTimings = {
  bundleMs: number | null; // null when the caller supplied a serveUrl or the bundle is prebuilt
  selectMs: number;
  renderMs: number; // renderMedia only
  totalMs: number;
  // renderMs / seconds of output, so renders of different lengths compare.
  renderMsPerOutputSecond: number;
};

export type RenderResult =
  | {
      cancelled: false;
      outputPath: string;
      outputSeconds: number;
      timings: RenderTimings;
      concurrency: number | null;
    }
  | {
      cancelled: true;
      outputPath: null;
    };

export type RenderUpdate =
  | {
      type: "status";
      message: string;
    }
  | {
      type: "progress";
      stage: "browser-download" | "bundling" | "rendering";
      progress: number;
    };
