export const RENDER_CANCELLED_MESSAGE = "Render cancelled.";

export type RenderResult =
  | {
      cancelled: false;
      outputPath: string;
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
