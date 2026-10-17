import { describe, expect, it } from "vitest";
import {
  brollPlaceholders,
  PLACEHOLDER_MESSAGE_MAX,
  shortJobError,
} from "../src/shared/brollPlaceholders";
import type { JobInfo, JobState } from "../src/shared/jobs";

let order = 0;
function job(state: JobState, extra: Partial<JobInfo> = {}): JobInfo {
  order++;
  return {
    id: `job-${order}`,
    type: "importClip",
    label: `Importing clip-${order}.mov`,
    state,
    percent: 0,
    seq: order,
    order,
    updatedAt: "2026-10-17T00:00:00.000Z",
    productId: "p1",
    ...extra,
  };
}

const none = new Set<string>();

describe("brollPlaceholders", () => {
  it("shows queued, running and cancelling jobs as progress tiles", () => {
    const jobs = [
      job("queued"),
      job("running", { percent: 40, stage: "Converting" }),
      job("cancelling", { percent: 50 }),
    ];
    const tiles = brollPlaceholders(jobs, "p1", none);
    expect(tiles.map((t) => t.kind)).toEqual([
      "progress",
      "progress",
      "progress",
    ]);
    expect(tiles.map((t) => t.queued)).toEqual([true, false, false]);
    expect(tiles[1]).toMatchObject({ percent: 40, stage: "Converting" });
  });

  it("keeps a failed job as an error tile with a short message", () => {
    const failed = job("failed", {
      error: "ffmpeg exited with code 1\nlots of log lines",
    });
    const [tile] = brollPlaceholders([failed], "p1", none);
    expect(tile).toMatchObject({
      jobId: failed.id,
      kind: "error",
      message: "ffmpeg exited with code 1",
    });
  });

  it("hides a failed tile once it is dismissed", () => {
    const failed = job("failed", { error: "boom" });
    expect(brollPlaceholders([failed], "p1", new Set([failed.id]))).toEqual([]);
  });

  it("removes cancelled jobs", () => {
    expect(brollPlaceholders([job("cancelled")], "p1", none)).toEqual([]);
  });

  it("keeps a done job as a Finishing tile until its clip is in the loaded list", () => {
    const done = job("done", { percent: 100, result: { mediaId: "m1" } });
    const [tile] = brollPlaceholders([done], "p1", none);
    expect(tile).toMatchObject({
      kind: "progress",
      percent: 100,
      stage: "Finishing",
    });
    expect(brollPlaceholders([done], "p1", none, new Set(["m1"]))).toEqual([]);
  });

  it("only shows this product's import jobs", () => {
    const mine = job("running");
    const jobs = [
      mine,
      job("running", { productId: "p2" }),
      job("running", { productId: undefined }),
    ];
    expect(brollPlaceholders(jobs, "p1", none).map((t) => t.jobId)).toEqual([
      mine.id,
    ]);
  });

  it("keeps enqueue order even if the list is shuffled", () => {
    const a = job("running");
    const b = job("queued");
    const tiles = brollPlaceholders([b, a], "p1", none);
    expect(tiles.map((t) => t.jobId)).toEqual([a.id, b.id]);
  });
});

describe("shortJobError", () => {
  it("falls back when there is no message", () => {
    expect(shortJobError(undefined)).toBe("Import failed.");
    expect(shortJobError("  \n")).toBe("Import failed.");
  });

  it("cuts a long first line", () => {
    const long = "x".repeat(300);
    const text = shortJobError(long);
    expect(text.length).toBe(PLACEHOLDER_MESSAGE_MAX);
    expect(text.endsWith("…")).toBe(true);
  });
});
