import { describe, expect, it } from "vitest";
import {
  backupFileName,
  formatLogLine,
  LOG_MESSAGE_MAX,
  redact,
  shouldRotate,
} from "../src/shared/logRotate";

describe("backupFileName", () => {
  it("numbers backups before the extension", () => {
    expect(backupFileName("sandwich.log", 0)).toBe("sandwich.log");
    expect(backupFileName("sandwich.log", 1)).toBe("sandwich.1.log");
    expect(backupFileName("sandwich.log", 2)).toBe("sandwich.2.log");
  });

  it("handles a name without an extension", () => {
    expect(backupFileName("sandwich", 1)).toBe("sandwich.1");
  });
});

describe("shouldRotate", () => {
  it("rotates only when the write would pass the limit", () => {
    expect(shouldRotate(900, 100, 1000)).toBe(false);
    expect(shouldRotate(900, 101, 1000)).toBe(true);
  });

  it("never rotates an empty file, so one huge entry is still written", () => {
    expect(shouldRotate(0, 5000, 1000)).toBe(false);
  });
});

describe("redact", () => {
  const token = "AbCdEfGh_ijklMNOP-qrstuvwxyz012345";

  it("removes the media server token from URLs", () => {
    expect(
      redact(`GET http://127.0.0.1:5123/m/${token}/clips/a.mp4 failed`),
    ).toBe("GET http://127.0.0.1:5123/m/[token]/clips/a.mp4 failed");
  });

  it("removes every occurrence", () => {
    const text = `/m/${token}/a and /m/${token}/b`;
    expect(redact(text)).toBe("/m/[token]/a and /m/[token]/b");
  });

  it("leaves ordinary text and short /m/ paths alone", () => {
    expect(redact("opened /m/short and a/b/c")).toBe(
      "opened /m/short and a/b/c",
    );
  });
});

describe("formatLogLine", () => {
  const date = new Date("2026-10-18T09:30:00.000Z");

  it("writes one timestamped line", () => {
    expect(formatLogLine("error", "main", "boom", date)).toBe(
      "2026-10-18T09:30:00.000Z ERROR [main] boom\n",
    );
  });

  it("keeps a stack attached by indenting its lines", () => {
    expect(formatLogLine("warn", "renderer", "bad\nat a\nat b", date)).toBe(
      "2026-10-18T09:30:00.000Z WARN [renderer] bad\n    at a\n    at b\n",
    );
  });

  it("redacts inside the formatter, so no call site can leak a token", () => {
    const line = formatLogLine(
      "info",
      "main",
      "http://127.0.0.1:1/m/AbCdEfGh_ijklMNOP-qrstuvwxyz012345/x.mp4",
      date,
    );
    expect(line).not.toContain("AbCdEfGh");
    expect(line).toContain("/m/[token]/x.mp4");
  });

  it("cuts a runaway message and says so", () => {
    const line = formatLogLine(
      "error",
      "main",
      "x".repeat(LOG_MESSAGE_MAX + 50),
      date,
    );
    expect(line).toContain("[cut 50 characters]");
    expect(line.length).toBeLessThan(LOG_MESSAGE_MAX + 200);
  });
});
