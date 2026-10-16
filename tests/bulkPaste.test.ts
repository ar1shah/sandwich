import { describe, expect, it } from "vitest";
import { parseBulkCaptions } from "../src/shared/bulkPaste";

describe("parseBulkCaptions (SPEC bulk format)", () => {
  it("parses the SPEC example", () => {
    const result = parseBulkCaptions(
      [
        "before | I can't fix my smile lines, it's genetics",
        "after | 4 weeks later",
        "broll | your sign to try {product}",
        "any | 10/10 {product}",
      ].join("\n"),
    );
    expect(result.errors).toEqual([]);
    expect(result.captions).toEqual([
      { slot: "before", text: "I can't fix my smile lines, it's genetics" },
      { slot: "after", text: "4 weeks later" },
      { slot: "broll", text: "your sign to try {product}" },
      { slot: "any", text: "10/10 {product}" },
    ]);
  });

  it("defaults to slot any when there is no pipe", () => {
    expect(parseBulkCaptions("just a caption").captions).toEqual([
      { slot: "any", text: "just a caption" },
    ]);
  });

  it("skips blank lines but keeps real line numbers in errors", () => {
    const result = parseBulkCaptions(
      "\n\nbefore | ok\n   \nnope | bad\n\nafter |",
    );
    expect(result.captions).toEqual([{ slot: "before", text: "ok" }]);
    expect(result.errors.map((e) => e.line)).toEqual([5, 7]);
  });

  it("reports an invalid slot with the line and raw text", () => {
    const [error] = parseBulkCaptions("hook | nope").errors;
    expect(error).toMatchObject({ line: 1, raw: "hook | nope" });
    expect(error?.message).toContain('"hook"');
  });

  it("reports empty text after the pipe", () => {
    const result = parseBulkCaptions("before |   ");
    expect(result.captions).toEqual([]);
    expect(result.errors).toEqual([
      { line: 1, raw: "before |   ", message: "Caption text is empty." },
    ]);
  });

  it("turns a literal \\n into a line break", () => {
    expect(
      parseBulkCaptions("after | Two weeks later\\nlook at this").captions,
    ).toEqual([{ slot: "after", text: "Two weeks later\nlook at this" }]);
  });

  it("trims spaces around the slot, text and \\n breaks, but not inside words", () => {
    expect(
      parseBulkCaptions("   BEFORE   |    a   b  \\n  c   ").captions,
    ).toEqual([{ slot: "before", text: "a   b\nc" }]);
  });

  it("only splits on the first pipe", () => {
    expect(parseBulkCaptions("any | this | that").captions).toEqual([
      { slot: "any", text: "this | that" },
    ]);
  });

  it("accepts Windows line endings and mixed-case slots", () => {
    const result = parseBulkCaptions("Before | a\r\nBROLL | b\r\n");
    expect(result.captions).toEqual([
      { slot: "before", text: "a" },
      { slot: "broll", text: "b" },
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseBulkCaptions("")).toEqual({ captions: [], errors: [] });
  });

  it("keeps good lines when others fail", () => {
    const result = parseBulkCaptions(
      "before | good\nbad | x\nafter | also good",
    );
    expect(result.captions).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
  });
});
