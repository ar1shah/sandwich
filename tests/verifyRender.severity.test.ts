import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDevFfPaths } from "../src/main/media/binaries";
import { describeRows, verifyRender } from "../src/main/render/verify";
import type { Recipe } from "../src/shared/recipe";
import { makeTempDir } from "./helpers/db";
import { emptyRecipe } from "./helpers/recipe";

const ff = resolveDevFfPaths();
const haveFfmpeg = existsSync(ff.ffmpeg) && existsSync(ff.ffprobe);

// Synthesizes a small clip with ffmpeg's lavfi sources.
function synth(
  out: string,
  options: { size: string; audio: "silent" | "tone"; seconds: number },
): void {
  execFileSync(
    ff.ffmpeg,
    [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=${options.size}:rate=30:duration=${options.seconds}`,
      "-f",
      "lavfi",
      "-i",
      options.audio === "tone"
        ? `sine=frequency=440:sample_rate=48000:duration=${options.seconds}`
        : `anullsrc=r=48000:cl=stereo`,
      "-t",
      String(options.seconds),
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-colorspace",
      "bt709",
      "-color_range",
      "tv",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      out,
    ],
    { stdio: "pipe" },
  );
}

function recipeOf(seconds: number): Recipe {
  const recipe = emptyRecipe();
  const each = seconds / 3;
  recipe.clips = recipe.clips.map((clip, index) => ({
    ...clip,
    mediaPath: "source.mp4",
    sourceDuration: 3,
    trimStart: 0,
    duration: each,
    muted: false,
    zoom: "none" as const,
    caption: null,
    slot: ["before", "after", "broll"][
      index
    ] as Recipe["clips"][number]["slot"],
  })) as Recipe["clips"];
  return recipe;
}

describe.skipIf(!haveFfmpeg)("verifyRender severity (real ffmpeg)", () => {
  it("a file that meets the spec passes with no failures", async () => {
    const dir = makeTempDir();
    const file = path.join(dir, "good.mp4");
    synth(file, { size: "1080x1920", audio: "tone", seconds: 3 });
    const result = await verifyRender({
      file,
      ffPaths: ff,
      expectedSeconds: 3,
    });
    expect(result.ok).toBe(true);
    expect(result.hardFailures).toEqual([]);
    expect(result.rows.every((r) => r.severity === "hard")).toBe(true);
  });

  it("a wrong frame size is a HARD failure", async () => {
    const dir = makeTempDir();
    const file = path.join(dir, "small.mp4");
    synth(file, { size: "540x960", audio: "tone", seconds: 3 });
    const result = await verifyRender({
      file,
      ffPaths: ff,
      expectedSeconds: 3,
    });
    expect(result.ok).toBe(false);
    expect(result.hardFailures.length).toBeGreaterThan(0);
    expect(describeRows(result.hardFailures).join(" ")).toMatch(/1080|size/i);
  });

  it("a silent render of audible, unmuted sources is a SOFT warning: still ok", async () => {
    const dir = makeTempDir();
    await mkdir(dir, { recursive: true });
    synth(path.join(dir, "source.mp4"), {
      size: "1080x1920",
      audio: "tone",
      seconds: 3,
    });
    const file = path.join(dir, "out.mp4");
    synth(file, { size: "1080x1920", audio: "silent", seconds: 9 });
    const result = await verifyRender({
      file,
      ffPaths: ff,
      recipe: recipeOf(9),
      mediaRoot: dir,
      catchSoftErrors: true,
    });
    expect(result.hardFailures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.every((r) => r.severity === "soft")).toBe(true);
    expect(result.warnings.some((r) => r.name.startsWith("audio"))).toBe(true);
  });

  it("a soft check that cannot run becomes a warning in the app but throws for the script", async () => {
    const dir = makeTempDir();
    const file = path.join(dir, "out.mp4");
    synth(file, { size: "1080x1920", audio: "tone", seconds: 9 });
    const recipe = recipeOf(9);
    recipe.clips[0] = { ...recipe.clips[0], mediaPath: "../escape.mp4" };
    const app = await verifyRender({
      file,
      ffPaths: ff,
      recipe,
      mediaRoot: dir,
      catchSoftErrors: true,
    });
    expect(app.ok).toBe(true);
    expect(app.warnings.map((r) => r.name)).toContain("recipe checks");
    await expect(
      verifyRender({ file, ffPaths: ff, recipe, mediaRoot: dir }),
    ).rejects.toThrow(/escapes the media root/);
  });
});
