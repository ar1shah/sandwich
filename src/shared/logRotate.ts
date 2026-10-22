import { z } from "zod";

// Log file rules, kept pure so they are unit tested without a disk. The logger itself is
// src/main/log/logger.ts.

export const LOG_FILE_NAME = "sandwich.log";
export const LOG_MAX_BYTES = 2 * 1024 * 1024;
// sandwich.log plus this many older files: sandwich.1.log (newer) and sandwich.2.log.
export const LOG_BACKUPS = 2;
// One entry never grows past this, so a runaway error cannot fill the disk in one write.
export const LOG_MESSAGE_MAX = 20_000;

export type LogLevel = "info" | "warn" | "error";

// `sandwich.log` -> `sandwich.1.log`. Index 0 is the live file.
export function backupFileName(fileName: string, index: number): string {
  if (index <= 0) {
    return fileName;
  }
  const dot = fileName.lastIndexOf(".");
  return dot > 0
    ? `${fileName.slice(0, dot)}.${index}${fileName.slice(dot)}`
    : `${fileName}.${index}`;
}

// True when appending `incomingBytes` would push a file that already has `currentBytes`
// past the limit. An empty file never rotates (one huge entry must still be written).
export function shouldRotate(
  currentBytes: number,
  incomingBytes: number,
  limit: number = LOG_MAX_BYTES,
): boolean {
  return currentBytes > 0 && currentBytes + incomingBytes > limit;
}

// The media server's base URL carries a per-session token (`/m/<token>/...`). Anything that
// might contain a URL is cleaned here, in the logger, so no call site can forget it.
const MEDIA_TOKEN = /\/m\/[A-Za-z0-9_-]{16,}/g;

export function redact(text: string): string {
  return text.replace(MEDIA_TOKEN, "/m/[token]");
}

function clip(text: string): string {
  return text.length > LOG_MESSAGE_MAX
    ? `${text.slice(0, LOG_MESSAGE_MAX)}... [cut ${text.length - LOG_MESSAGE_MAX} characters]`
    : text;
}

// One line per entry: `2026-10-18T09:30:00.000Z ERROR [renderer] message`. Newlines inside a
// message are indented so a stack trace stays attached to its entry.
export function formatLogLine(
  level: LogLevel,
  scope: string,
  message: string,
  date: Date,
): string {
  const body = redact(clip(message)).replace(/\r?\n/g, "\n    ");
  return `${date.toISOString()} ${level.toUpperCase()} [${scope}] ${body}\n`;
}

// What the renderer may ask main to log (error boundary, window error and unhandled rejection
// listeners). Capped here and again by the logger.
export const RendererLogEntrySchema = z.object({
  level: z.enum(["info", "warn", "error"]),
  message: z.string().max(10_000),
  stack: z.string().max(20_000).optional(),
});
export type RendererLogEntry = z.infer<typeof RendererLogEntrySchema>;
