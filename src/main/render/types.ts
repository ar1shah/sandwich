export const RENDER_CANCELLED_MESSAGE = "Render cancelled.";

export type RenderTimings = {
  bundleMs: number | null; // dev only: packaged builds use the prebuilt bundle
  selectMs: number;
  renderMs: number;
  totalMs: number;
};

export type RenderResult =
  | {
      cancelled: false;
      outputPath: string;
      timings: RenderTimings;
      concurrency: number | null;
      // Encoder name seen in Remotion's verbose logs, plus the matching log lines.
      encoder: string | null;
      encoderLogLines: string[];
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
