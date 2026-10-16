import { describe, expect, it } from "vitest";
import {
  DEFAULT_TONE_MAP,
  buildNormalizeArgs,
  buildToneMapFilter,
  buildVideoFilter,
  chooseToneMapPath,
  swscaleInputMatrix,
  swscaleInputRange,
  targetSize,
} from "../src/shared/ffmpegArgs";
import { makeProbe } from "./helpers/probe";

const IO = { input: "in.mov", output: "out.mp4.partial" };

function valueAfter(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at < 0 ? undefined : args[at + 1];
}

function allValuesAfter(args: string[], flag: string): string[] {
  return args.flatMap((arg, at) =>
    arg === flag && args[at + 1] !== undefined ? [args[at + 1] as string] : [],
  );
}

describe("targetSize", () => {
  it("keeps sizes within the long edge untouched", () => {
    expect(targetSize(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(targetSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it("downscales 4K to a 1920 long edge", () => {
    expect(targetSize(2160, 3840)).toEqual({ width: 1080, height: 1920 });
    expect(targetSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
  });

  it("never upscales", () => {
    expect(targetSize(720, 1280)).toEqual({ width: 720, height: 1280 });
  });

  it("rounds to even dimensions", () => {
    expect(targetSize(1206, 2622)).toEqual({ width: 884, height: 1920 });
    expect(targetSize(1081, 1919)).toEqual({ width: 1082, height: 1920 });
  });
});

describe("chooseToneMapPath", () => {
  it("uses zscale when present", () => {
    expect(chooseToneMapPath({ filters: { zscale: true } })).toBe("zscale");
  });

  it("throws a clear error without zscale", () => {
    expect(() =>
      chooseToneMapPath({ filters: { zscale: false, libplacebo: true } }),
    ).toThrow(/zscale/);
  });
});

describe("buildToneMapFilter", () => {
  it("uses the tuned defaults (hable, npl 180, desat 0)", () => {
    const filter = buildToneMapFilter();
    expect(filter).toContain("t=linear:npl=180");
    expect(filter).toContain("tonemap=tonemap=hable:desat=0");
    expect(filter).toContain("format=gbrpf32le");
    expect(filter).toContain("zscale=p=bt709");
    expect(filter.endsWith("zscale=t=bt709:m=bt709:r=tv,format=yuv420p")).toBe(
      true,
    );
  });

  it("takes npl, algorithm and desat", () => {
    const filter = buildToneMapFilter({
      npl: 203,
      algorithm: "mobius",
      desat: 0.5,
    });
    expect(filter).toContain("npl=203");
    expect(filter).toContain("tonemap=mobius:desat=0.5");
  });

  it("passes the source tags explicitly and defaults missing ones", () => {
    expect(
      buildToneMapFilter(DEFAULT_TONE_MAP, {
        transfer: "smpte2084",
        matrix: "bt2020nc",
        primaries: "bt2020",
      }),
    ).toContain("tin=smpte2084:min=bt2020nc:pin=bt2020");
    expect(buildToneMapFilter(DEFAULT_TONE_MAP)).toContain(
      "tin=arib-std-b67:min=bt2020nc:pin=bt2020",
    );
  });
});

describe("swscale input mapping", () => {
  it("maps color range", () => {
    expect(swscaleInputRange("pc")).toBe("full");
    expect(swscaleInputRange("tv")).toBe("tv");
    expect(swscaleInputRange(null)).toBe("tv");
  });

  it("maps SD matrices to bt601 and everything else to bt709", () => {
    expect(swscaleInputMatrix("smpte170m")).toBe("bt601");
    expect(swscaleInputMatrix("bt470bg")).toBe("bt601");
    expect(swscaleInputMatrix("bt709")).toBe("bt709");
    expect(swscaleInputMatrix(null)).toBe("bt709");
  });
});

describe("buildVideoFilter (SDR)", () => {
  it("handles a full-range bt709 screen recording", () => {
    const filter = buildVideoFilter(
      makeProbe({
        width: 1206,
        height: 2622,
        displayWidth: 1206,
        displayHeight: 2622,
        pixFmt: "yuvj420p",
        colorRange: "pc",
      }),
    );
    expect(filter).toBe(
      "fps=30,scale=884:1920:flags=bicubic:in_range=full:in_color_matrix=bt709" +
        ":out_range=tv:out_color_matrix=bt709,format=yuv420p,setsar=1",
    );
  });

  it("treats untagged footage as limited range bt709", () => {
    const filter = buildVideoFilter(
      makeProbe({ colorRange: null, colorSpace: null }),
    );
    expect(filter).toContain("in_range=tv:in_color_matrix=bt709");
  });

  it("reads bt601-tagged footage with the bt601 matrix", () => {
    const filter = buildVideoFilter(makeProbe({ colorSpace: "smpte170m" }));
    expect(filter).toContain("in_color_matrix=bt601");
    expect(filter).toContain("out_color_matrix=bt709");
  });
});

describe("buildVideoFilter (HDR)", () => {
  const hdr = makeProbe({
    isHdr: true,
    colorTransfer: "arib-std-b67",
    colorSpace: "bt2020nc",
    colorPrimaries: "bt2020",
    pixFmt: "yuv420p10le",
    codec: "hevc",
    fps: 60,
  });

  it("drops frames and scales before tone mapping, then sets SAR", () => {
    const filter = buildVideoFilter(hdr);
    const parts = filter.split(",");
    expect(parts[0]).toBe("fps=30");
    expect(parts[1]).toMatch(/^scale=1080:1920/);
    expect(filter.indexOf("fps=30")).toBeLessThan(filter.indexOf("zscale"));
    expect(filter.indexOf("scale=1080")).toBeLessThan(filter.indexOf("zscale"));
    expect(filter).toContain("tin=arib-std-b67:min=bt2020nc:pin=bt2020");
    expect(filter.endsWith("setsar=1")).toBe(true);
  });

  it("applies custom tone map params", () => {
    const filter = buildVideoFilter(hdr, {
      npl: 203,
      algorithm: "reinhard",
      desat: 0,
    });
    expect(filter).toContain("npl=203");
    expect(filter).toContain("tonemap=reinhard");
  });
});

describe("buildNormalizeArgs", () => {
  it("encodes to the working-file spec", () => {
    const args = buildNormalizeArgs(makeProbe(), IO);
    expect(valueAfter(args, "-c:v")).toBe("libx264");
    expect(valueAfter(args, "-crf")).toBe("18");
    expect(valueAfter(args, "-preset")).toBe("veryfast");
    expect(valueAfter(args, "-profile:v")).toBe("high");
    expect(valueAfter(args, "-pix_fmt")).toBe("yuv420p");
    expect(valueAfter(args, "-fps_mode")).toBe("cfr");
    expect(valueAfter(args, "-r")).toBe("30");
    expect(valueAfter(args, "-colorspace")).toBe("bt709");
    expect(valueAfter(args, "-color_trc")).toBe("bt709");
    expect(valueAfter(args, "-color_primaries")).toBe("bt709");
    expect(valueAfter(args, "-color_range")).toBe("tv");
    expect(valueAfter(args, "-c:a")).toBe("aac");
    expect(valueAfter(args, "-ar")).toBe("48000");
    expect(valueAfter(args, "-ac")).toBe("2");
    expect(valueAfter(args, "-movflags")).toBe("+faststart");
    expect(valueAfter(args, "-f")).toBe("mp4");
    expect(valueAfter(args, "-progress")).toBe("pipe:1");
    expect(args.at(-1)).toBe(IO.output);
    expect(valueAfter(args, "-i")).toBe(IO.input);
  });

  it("is an argument array with no shell quoting", () => {
    const args = buildNormalizeArgs(makeProbe(), {
      input: "/Users/a b/it's.mov",
      output: "out dir/x.partial",
    });
    expect(args).toContain("/Users/a b/it's.mov");
    expect(args).toContain("out dir/x.partial");
  });

  it("bounds the output to the source duration", () => {
    const args = buildNormalizeArgs(makeProbe({ duration: 6.35 }), IO);
    expect(valueAfter(args, "-t")).toBe("6.350");
  });

  it("maps streams explicitly and drops chapters, metadata and data tracks", () => {
    const args = buildNormalizeArgs(makeProbe(), IO);
    expect(allValuesAfter(args, "-map")).toEqual(["0:v:0", "0:1"]);
    expect(valueAfter(args, "-map_chapters")).toBe("-1");
    expect(valueAfter(args, "-map_metadata")).toBe("-1");
  });

  it("maps the AAC stream of an iPhone clip, not the apac stream", () => {
    // Layout of fixtures/real/iphone_hdr.MOV: 0 video, 1 AAC, 2 apac, 3-8 mebx.
    const args = buildNormalizeArgs(makeProbe({ audioStreamIndex: 1 }), IO);
    expect(allValuesAfter(args, "-map")).toEqual(["0:v:0", "0:1"]);
    const other = buildNormalizeArgs(makeProbe({ audioStreamIndex: 4 }), IO);
    expect(allValuesAfter(other, "-map")).toEqual(["0:v:0", "0:4"]);
  });

  it("resyncs and pads real audio", () => {
    const args = buildNormalizeArgs(makeProbe(), IO);
    expect(valueAfter(args, "-af")).toBe("aresample=async=1:first_pts=0,apad");
    expect(args.filter((arg) => arg === "-i")).toHaveLength(1);
  });

  it("adds silent audio when there is no decodable audio stream", () => {
    const args = buildNormalizeArgs(
      makeProbe({
        hasAudio: false,
        audioStreamIndex: null,
        audioChannels: null,
        audioSampleRate: null,
      }),
      IO,
    );
    expect(allValuesAfter(args, "-i")).toEqual([
      IO.input,
      "anullsrc=r=48000:cl=stereo",
    ]);
    expect(allValuesAfter(args, "-f")).toEqual(["lavfi", "mp4"]);
    expect(allValuesAfter(args, "-map")).toEqual(["0:v:0", "1:a:0"]);
    expect(args).not.toContain("-af");
  });

  it("downscales 4K and keeps the aspect for horizontal clips", () => {
    const fourK = buildNormalizeArgs(
      makeProbe({
        width: 2160,
        height: 3840,
        displayWidth: 2160,
        displayHeight: 3840,
      }),
      IO,
    );
    expect(valueAfter(fourK, "-vf")).toContain("scale=1080:1920");
    const wide = buildNormalizeArgs(
      makeProbe({
        width: 1920,
        height: 1080,
        displayWidth: 1920,
        displayHeight: 1080,
      }),
      IO,
    );
    expect(valueAfter(wide, "-vf")).toContain("scale=1920:1080");
  });

  it("scales a rotated clip by its display size, leaving rotation to autorotate", () => {
    const args = buildNormalizeArgs(
      makeProbe({
        width: 1920,
        height: 1080,
        rotation: 270,
        displayWidth: 1080,
        displayHeight: 1920,
      }),
      IO,
    );
    expect(args).not.toContain("-noautorotate");
    expect(valueAfter(args, "-vf")).toContain("scale=1080:1920");
  });

  it("forces constant 30 fps for VFR and 60 fps sources", () => {
    for (const probe of [
      makeProbe({ isVfr: true, fps: 17.8 }),
      makeProbe({ fps: 60 }),
    ]) {
      const args = buildNormalizeArgs(probe, IO);
      expect(valueAfter(args, "-vf")?.startsWith("fps=30,")).toBe(true);
      expect(valueAfter(args, "-fps_mode")).toBe("cfr");
      expect(valueAfter(args, "-r")).toBe("30");
    }
  });

  it("tone maps HDR input and leaves SDR input alone", () => {
    const hdr = buildNormalizeArgs(
      makeProbe({ isHdr: true, colorTransfer: "smpte2084" }),
      IO,
    );
    expect(valueAfter(hdr, "-vf")).toContain("tonemap=tonemap=hable");
    const sdr = buildNormalizeArgs(makeProbe(), IO);
    expect(valueAfter(sdr, "-vf")).not.toContain("tonemap");
  });

  it("passes custom tone map params through", () => {
    const args = buildNormalizeArgs(makeProbe({ isHdr: true }), {
      ...IO,
      toneMap: { npl: 203, algorithm: "mobius", desat: 0 },
    });
    expect(valueAfter(args, "-vf")).toContain("npl=203");
    expect(valueAfter(args, "-vf")).toContain("tonemap=mobius");
  });
});
