import { describe, expect, it } from "vitest";
import {
  createProgressParser,
  parseClockTime,
} from "../src/shared/ffmpegProgress";

// Real ffmpeg writes out_time consistent with out_time_us.
const clock = (us: string): string => {
  const seconds = Number(us) / 1_000_000;
  return `00:00:${seconds.toFixed(6).padStart(9, "0")}`;
};

const BLOCK = (us: string, end = false): string =>
  [
    "frame=30",
    "fps=60.0",
    `out_time_us=${us}`,
    `out_time_ms=${us}`,
    `out_time=${clock(us)}`,
    "speed=2x",
    `progress=${end ? "end" : "continue"}`,
    "",
  ].join("\n");

describe("parseClockTime", () => {
  it("parses h:mm:ss.micro", () => {
    expect(parseClockTime("00:00:03.500000")).toBe(3.5);
    expect(parseClockTime("01:02:03.000000")).toBe(3723);
    expect(parseClockTime("-00:00:00.033333")).toBeCloseTo(-0.033333, 5);
  });

  it("returns null for N/A and junk", () => {
    expect(parseClockTime("N/A")).toBeNull();
    expect(parseClockTime("")).toBeNull();
  });
});

describe("createProgressParser", () => {
  it("reports percent at the end of each block", () => {
    const parser = createProgressParser(10);
    expect(parser.push(BLOCK("2500000"))).toEqual([
      { percent: 25, outTimeSeconds: 2.5, done: false },
    ]);
    expect(parser.push(BLOCK("5000000"))[0]?.percent).toBe(50);
  });

  it("handles several blocks in one chunk", () => {
    const updates = createProgressParser(10).push(
      BLOCK("1000000") + BLOCK("2000000"),
    );
    expect(updates.map((u) => u.percent)).toEqual([10, 20]);
  });

  it("reassembles lines split across chunks", () => {
    const parser = createProgressParser(10);
    const text = BLOCK("4000000");
    const cut = text.indexOf("out_time_us=") + 8;
    expect(parser.push(text.slice(0, cut))).toEqual([]);
    const updates = parser.push(text.slice(cut));
    expect(updates).toHaveLength(1);
    expect(updates[0]?.percent).toBe(40);
  });

  it("tolerates N/A before the first frame is written", () => {
    const parser = createProgressParser(10);
    const early = [
      "frame=0",
      "out_time_us=N/A",
      "out_time_ms=N/A",
      "out_time=N/A",
      "progress=continue",
      "",
    ].join("\n");
    expect(parser.push(early)).toEqual([
      { percent: 0, outTimeSeconds: 0, done: false },
    ]);
  });

  it("keeps the last good time when a block has none", () => {
    const parser = createProgressParser(10);
    parser.push(BLOCK("3000000"));
    expect(parser.push("frame=1\nprogress=continue\n")[0]?.percent).toBe(30);
  });

  it("falls back to out_time when microsecond fields are missing", () => {
    const parser = createProgressParser(4);
    const updates = parser.push(
      "out_time=00:00:02.000000\nprogress=continue\n",
    );
    expect(updates[0]?.percent).toBe(50);
  });

  it("clamps to 100 and reports done on progress=end", () => {
    const parser = createProgressParser(2);
    expect(parser.push(BLOCK("3000000"))[0]?.percent).toBe(100);
    expect(parser.push(BLOCK("1000000", true))[0]).toMatchObject({
      percent: 100,
      done: true,
    });
  });

  it("handles CRLF and a zero duration", () => {
    const crlf = createProgressParser(10).push(
      "out_time_us=5000000\r\nprogress=continue\r\n",
    );
    expect(crlf[0]?.percent).toBe(50);
    const zero = createProgressParser(0).push(BLOCK("1000000"));
    expect(zero[0]?.percent).toBe(0);
  });

  it("ignores lines without an equals sign", () => {
    expect(
      createProgressParser(10).push("garbage\nprogress=continue\n"),
    ).toHaveLength(1);
  });
});
