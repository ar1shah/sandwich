import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/shared/formatDuration";

describe("formatDuration", () => {
  it("shows one decimal under a minute", () => {
    expect(formatDuration(4.6)).toBe("4.6s");
    expect(formatDuration(12)).toBe("12.0s");
    expect(formatDuration(5)).toBe("5.0s");
    expect(formatDuration(0)).toBe("0.0s");
  });

  it("floors instead of rounding, so a clip never reads longer than it is", () => {
    expect(formatDuration(4.95)).toBe("4.9s");
    expect(formatDuration(4.96)).toBe("4.9s");
    expect(formatDuration(4.99)).toBe("4.9s");
    expect(formatDuration(5.04)).toBe("5.0s");
  });

  it("never prints 60.0s: 59.96 stays in the decimal form", () => {
    expect(formatDuration(59.96)).toBe("59.9s");
    expect(formatDuration(59.99)).toBe("59.9s");
  });

  it("switches to m:ss at 60 seconds", () => {
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(60.9)).toBe("1:00");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(75.99)).toBe("1:15");
    expect(formatDuration(600)).toBe("10:00");
    expect(formatDuration(3725)).toBe("62:05");
  });

  it("does not lose a tenth to float noise", () => {
    expect(formatDuration(0.1 + 0.2)).toBe("0.3s");
    expect(formatDuration(4.6)).toBe("4.6s");
    expect(formatDuration(1.1)).toBe("1.1s");
    expect(formatDuration(2.3)).toBe("2.3s");
    expect(formatDuration(59.9)).toBe("59.9s");
  });

  it("treats bad input as zero", () => {
    expect(formatDuration(-3)).toBe("0.0s");
    expect(formatDuration(Number.NaN)).toBe("0.0s");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0.0s");
  });
});
