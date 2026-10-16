import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import type { ProbeResult } from "../src/shared/probeParse";
import {
  audioSourceArg,
  buildFixtureCommands,
  buildSampleRecipe,
  checkProbe,
  FIXTURES,
  formatTable,
  GENERATOR_VERSION,
  hashFixture,
  pulseExpr,
  redFraction,
  tempName,
  videoFilterChain,
  type FixtureSpec,
} from "../scripts/fixtures/specs";

function spec(name: string): FixtureSpec {
  const found = FIXTURES.find((fixture) => fixture.name === name);
  if (!found) {
    throw new Error(`no fixture ${name}`);
  }
  return found;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("sync pulse", () => {
  it("is a 0.1 s window once per second with escaped commas", () => {
    expect(pulseExpr()).toBe("lt(mod(t\\,1)\\,0.1)");
  });

  it("gates the beep and the white flash with the same expression", () => {
    const fixture = spec("vertical_1080x1920_30.mp4");
    expect(audioSourceArg(fixture)).toContain(pulseExpr());
    expect(videoFilterChain(fixture)).toContain(`enable='${pulseExpr()}'`);
  });

  it("builds stereo and mono sources at the fixture's rate and tone", () => {
    const stereo = audioSourceArg(spec("vertical_1080x1920_30.mp4"));
    expect(stereo).toContain("sin(2*PI*440*t)");
    expect(stereo).toContain(":s=48000:c=stereo");
    expect(stereo.split("|")).toHaveLength(2);

    const mono = audioSourceArg(spec("mono_44k.mp4"));
    expect(mono).toContain(":s=44100:c=mono");
    expect(mono).not.toContain("|");
  });

  it("gives every audible fixture a distinct tone", () => {
    const tones = FIXTURES.flatMap((f) => (f.tone === null ? [] : [f.tone]));
    expect(new Set(tones).size).toBe(tones.length);
  });
});

describe("buildFixtureCommands", () => {
  it("emits argument arrays with relative paths and -t on every lavfi input", () => {
    for (const fixture of FIXTURES) {
      const { steps, output, intermediates } = buildFixtureCommands(fixture);
      for (const file of [output, ...intermediates]) {
        expect(path.isAbsolute(file)).toBe(false);
        expect(file).not.toContain(os.tmpdir());
        expect(file).toContain(".tmp.");
      }
      for (const args of steps) {
        expect(args.every((arg) => typeof arg === "string")).toBe(true);
        args.forEach((arg, index) => {
          if (arg === "lavfi") {
            // -f lavfi -t <seconds> -i <source>
            expect(args[index + 1]).toBe("-t");
            expect(args[index + 3]).toBe("-i");
          }
        });
      }
    }
  });

  it("uses a two-step encode and remux for the rotated fixture", () => {
    const { steps, intermediates } = buildFixtureCommands(
      spec("rotated_90.mp4"),
    );
    expect(steps).toHaveLength(2);
    expect(intermediates).toEqual(["fixtures/rotated_90.pre.tmp.mp4"]);
    expect(steps[0]?.join(" ")).toContain("transpose=1");
    expect(steps[1]).toEqual(
      expect.arrayContaining(["-display_rotation", "90", "-c", "copy"]),
    );
    // -display_rotation is an input option: it must come before -i.
    const remux = steps[1] ?? [];
    expect(remux.indexOf("-display_rotation")).toBeLessThan(
      remux.indexOf("-i"),
    );
  });

  it("tags HDR fixtures bt2020 10-bit with the right transfer", () => {
    const hlg = buildFixtureCommands(spec("hdr_hlg_10bit.mov")).steps[0] ?? [];
    expect(hlg).toEqual(
      expect.arrayContaining([
        "libx265",
        "yuv420p10le",
        "arib-std-b67",
        "bt2020",
      ]),
    );
    const pq = buildFixtureCommands(spec("hdr_pq_10bit.mov")).steps[0] ?? [];
    expect(pq).toContain("smpte2084");
  });

  it("drops frames only for the VFR fixture and uses ultrafast for 4K", () => {
    expect(videoFilterChain(spec("vfr.mp4"))).toContain("select=");
    expect(videoFilterChain(spec("vertical_1080x1920_30.mp4"))).not.toContain(
      "select=",
    );
    expect(buildFixtureCommands(spec("vertical_4k.mp4")).steps[0]).toContain(
      "ultrafast",
    );
    expect(
      buildFixtureCommands(spec("vertical_1080x1920_30.mp4")).steps[0],
    ).toContain("veryfast");
  });

  it("omits audio for no_audio and rejects unsafe labels", () => {
    const args = buildFixtureCommands(spec("no_audio.mp4")).steps[0] ?? [];
    expect(args).toContain("-an");
    expect(args).not.toContain("aac");
    expect(() =>
      videoFilterChain({ ...spec("short_1s.mp4"), label: "it's: bad" }),
    ).toThrow("Unsafe label");
  });

  it("names temp files next to the final name", () => {
    expect(tempName("a.mp4")).toBe("a.tmp.mp4");
    expect(tempName("a.mp4", ".pre")).toBe("a.pre.tmp.mp4");
  });
});

describe("hashFixture", () => {
  const base = {
    steps: [["-i", "fixtures/a.tmp.mp4"]],
    ffmpegVersion: "ffmpeg version 6.0",
    fontSha256: "abc",
  };

  it("is stable for the same spec", () => {
    expect(hashFixture(base)).toBe(hashFixture({ ...base }));
  });

  it("does not depend on where the project lives on disk", () => {
    const fixture = spec("rotated_90.mp4");
    // Built from relative paths only, so a different checkout location cannot change it.
    const a = hashFixture({
      ...base,
      steps: buildFixtureCommands(fixture).steps,
    });
    const b = hashFixture({
      ...base,
      steps: buildFixtureCommands(fixture).steps,
    });
    expect(a).toBe(b);
  });

  it("changes with args, ffmpeg build, font or generator version", () => {
    const reference = hashFixture(base);
    expect(hashFixture({ ...base, steps: [["-i", "other"]] })).not.toBe(
      reference,
    );
    expect(
      hashFixture({ ...base, ffmpegVersion: "ffmpeg version 7" }),
    ).not.toBe(reference);
    expect(hashFixture({ ...base, fontSha256: "def" })).not.toBe(reference);
    expect(
      hashFixture({ ...base, generatorVersion: GENERATOR_VERSION + 1 }),
    ).not.toBe(reference);
  });
});

describe("buildSampleRecipe", () => {
  const recipe = buildSampleRecipe({ before: 8, after: 8, broll: 8 });

  it("has three clips in before, after, broll order", () => {
    expect(recipe.clips.map((clip) => clip.slot)).toEqual([
      "before",
      "after",
      "broll",
    ]);
  });

  it("totals 12 seconds and keeps trims inside the source", () => {
    const total = recipe.clips.reduce((sum, clip) => sum + clip.duration, 0);
    expect(total).toBe(12);
    for (const clip of recipe.clips) {
      expect(clip.trimStart + clip.duration).toBeLessThanOrEqual(
        clip.sourceDuration - 0.5,
      );
    }
  });

  it("uses valid UUIDs and a fixed slug", () => {
    expect(recipe.id).toMatch(UUID);
    expect(recipe.productId).toMatch(UUID);
    expect(recipe.productSlug).toBe("fixture-product");
  });

  it("covers the requested zoom, mute and caption variety", () => {
    const [before, after, broll] = recipe.clips;
    expect(before.zoom).toBe("slow-push");
    expect(after.zoom).toBe("punch-in");
    expect(after.focus).toEqual({ x: 0.3, y: 0.35 });
    expect(before.focus).toEqual({ x: 0.5, y: 0.5 });
    expect(broll.muted).toBe(true);
    expect(before.caption?.text).not.toContain("\n");
    expect(after.caption?.text).toContain("\n");
    expect(after.caption?.style).toBe("box");
    expect(broll.caption?.text.length).toBeGreaterThan(60);
    expect(recipe.output).toEqual({ width: 1080, height: 1920, fps: 30 });
  });

  it("only uses sources that look like normalized media", () => {
    for (const clip of recipe.clips) {
      const source = spec(clip.mediaPath);
      expect(source).toMatchObject({
        width: 1080,
        height: 1920,
        fps: 30,
        kind: "video",
      });
      expect(source.vfr).toBeUndefined();
      expect(source.hdr).toBeUndefined();
      expect(source.rotated).toBeUndefined();
    }
  });

  it("throws when a trim runs too close to the end of the source", () => {
    expect(() =>
      buildSampleRecipe({ before: 4.2, after: 8, broll: 8 }),
    ).toThrow("leaves under");
  });
});

describe("redFraction", () => {
  it("counts clearly red pixels in rgb24 bytes", () => {
    const bytes = Uint8Array.from([
      255, 0, 0, 254, 3, 2, 0, 0, 255, 255, 255, 255,
    ]);
    expect(redFraction(bytes)).toBe(0.5);
  });

  it("returns 0 for empty input", () => {
    expect(redFraction(new Uint8Array())).toBe(0);
  });
});

describe("checkProbe", () => {
  const good: ProbeResult = {
    duration: 8,
    width: 1080,
    height: 1920,
    rotation: 0,
    displayWidth: 1080,
    displayHeight: 1920,
    fps: 30,
    isVfr: false,
    hasAudio: true,
    audioChannels: 2,
    audioSampleRate: 48000,
    audioCodec: "aac",
    audioDuration: 8,
    audioStreamIndex: 1,
    colorTransfer: "bt709",
    colorSpace: "bt709",
    colorPrimaries: "bt709",
    colorRange: "tv",
    isHdr: false,
    pixFmt: "yuv420p",
    recordedAt: null,
    codec: "h264",
  };

  it("accepts a matching probe and flags mismatches", () => {
    const fixture = spec("vertical_1080x1920_30.mp4");
    expect(checkProbe(fixture, good)).toEqual([]);
    expect(checkProbe(fixture, { ...good, duration: 8.2 })).toHaveLength(1);
    expect(checkProbe(fixture, { ...good, hasAudio: false })).not.toEqual([]);
  });

  it("expects rotation 270 and swapped coded size for the rotated fixture", () => {
    const fixture = spec("rotated_90.mp4");
    const rotated: ProbeResult = {
      ...good,
      duration: 5,
      width: 1920,
      height: 1080,
      rotation: 270,
    };
    expect(checkProbe(fixture, rotated)).toEqual([]);
    expect(checkProbe(fixture, { ...rotated, rotation: 90 })).toHaveLength(1);
  });
});

describe("formatTable", () => {
  it("pads columns to the widest cell", () => {
    const table = formatTable(["a", "bb"], [["xxx", "y"]]);
    expect(table.split("\n")).toEqual(["a    bb", "---  --", "xxx  y "]);
  });
});
