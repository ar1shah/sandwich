// Local media server (ARCHITECTURE section 5). Serves files from a library root over
// http://127.0.0.1:<port>/m/<token>/<relative path> so the Player and Remotion's headless
// browser can load video by URL. node:http only. The token and the full base URL are
// secrets: never log them.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pipeline } from "node:stream";
import { parseRangeHeader } from "../../shared/httpRange";
import {
  decodeMediaSegments,
  MEDIA_URL_PREFIX,
  parseMediaRequestUrl,
} from "../../shared/mediaPath";
import { resolveInsideReal } from "./pathGuard";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers":
    "Content-Range, Accept-Ranges, Content-Length",
};

export type MediaServerOptions = {
  // Called per request so the root can change (or appear) without a restart.
  // null means "no library yet": requests get 503.
  getRoot: () => string | null;
};

export type MediaServer = {
  // http://127.0.0.1:<port>/m/<token>  (contains the token: do not log)
  baseUrl: string;
  port: number;
  close: () => Promise<void>;
};

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Comparing fixed-length digests avoids timingSafeEqual's throw on unequal lengths.
function tokenMatches(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

function send(
  res: http.ServerResponse,
  status: number,
  headers: Record<string, string | number> = {},
): void {
  res.writeHead(status, { ...CORS_HEADERS, ...headers });
  res.end();
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  token: string,
  getRoot: () => string | null,
): Promise<void> {
  if (req.method === "OPTIONS") {
    send(res, 204, {
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range",
      "Access-Control-Max-Age": 600,
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, { Allow: "GET, HEAD, OPTIONS" });
    return;
  }

  const parts = parseMediaRequestUrl(req.url);
  if (!parts) {
    send(res, 404);
    return;
  }
  if (!tokenMatches(parts.token, token)) {
    send(res, 403);
    return;
  }
  const decoded = decodeMediaSegments(parts.rawSegments);
  if (!decoded.ok) {
    send(res, decoded.reason === "bad-encoding" ? 400 : 403);
    return;
  }

  const root = getRoot();
  if (!root) {
    send(res, 503, { "Retry-After": 5 });
    return;
  }
  const resolved = await resolveInsideReal(root, decoded.segments);
  if (resolved.kind === "no-root") {
    send(res, 503, { "Retry-After": 5 });
    return;
  }
  if (resolved.kind === "outside") {
    send(res, 403);
    return;
  }
  if (resolved.kind === "missing") {
    send(res, 404);
    return;
  }

  const filePath = resolved.path;
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    send(res, 404);
    return;
  }

  const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const validators = {
    ETag: etag,
    "Last-Modified": info.mtime.toUTCString(),
    "Cache-Control": "private, max-age=3600",
  };
  if (!req.headers.range && req.headers["if-none-match"] === etag) {
    send(res, 304, validators);
    return;
  }

  const range = parseRangeHeader(req.headers.range, info.size);
  if (range.kind === "unsatisfiable") {
    send(res, 416, { "Content-Range": `bytes */${info.size}` });
    return;
  }

  const start = range.kind === "range" ? range.start : 0;
  const end = range.kind === "range" ? range.end : info.size - 1;
  res.writeHead(range.kind === "range" ? 206 : 200, {
    ...CORS_HEADERS,
    ...validators,
    "Accept-Ranges": "bytes",
    "Content-Type":
      CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
      "application/octet-stream",
    "Content-Length": info.size === 0 ? 0 : end - start + 1,
    ...(range.kind === "range"
      ? { "Content-Range": `bytes ${start}-${end}/${info.size}` }
      : {}),
  });

  if (req.method === "HEAD" || info.size === 0) {
    res.end();
    return;
  }
  // pipeline destroys the file stream when the client aborts (scrubbing does this
  // constantly), so the file descriptor is released.
  pipeline(createReadStream(filePath, { start, end }), res, () => undefined);
}

export async function startMediaServer({
  getRoot,
}: MediaServerOptions): Promise<MediaServer> {
  const token = randomBytes(24).toString("base64url");

  const server = http.createServer((req, res) => {
    handle(req, res, token, getRoot).catch(() => {
      if (res.headersSent) {
        res.destroy();
      } else {
        send(res, 400);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}/${MEDIA_URL_PREFIX}/${token}`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
