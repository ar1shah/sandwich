// Step 0.4 throwaway media server: 127.0.0.1, ephemeral port, one allowlisted directory,
// byte-range support. Step 1.3 replaces it with the real token-protected server.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { parseRangeHeader } from "../../shared/httpRange";
import { resolveInside } from "./pathGuard";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".jpg": "image/jpeg",
};

export type SpikeMediaServer = {
  origin: string; // e.g. http://127.0.0.1:51234
  close: () => Promise<void>;
};

function send(
  res: http.ServerResponse,
  status: number,
  headers: Record<string, string | number> = {},
): void {
  res.writeHead(status, { "Access-Control-Allow-Origin": "*", ...headers });
  res.end();
}

export async function startSpikeMediaServer(
  rootDir: string,
): Promise<SpikeMediaServer> {
  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        if (req.method !== "GET" && req.method !== "HEAD") {
          send(res, 405, { Allow: "GET, HEAD" });
          return;
        }

        const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
        const requested = decodeURIComponent(pathname).replace(/^\/+/, "");
        const filePath = resolveInside(rootDir, requested);
        if (!filePath) {
          send(res, 403);
          return;
        }

        const info = await stat(filePath).catch(() => null);
        if (!info?.isFile()) {
          send(res, 404);
          return;
        }

        const range = parseRangeHeader(req.headers.range, info.size);
        const contentType =
          CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
          "application/octet-stream";

        if (range.kind === "unsatisfiable") {
          send(res, 416, { "Content-Range": `bytes */${info.size}` });
          return;
        }

        const start = range.kind === "range" ? range.start : 0;
        const end = range.kind === "range" ? range.end : info.size - 1;
        res.writeHead(range.kind === "range" ? 206 : 200, {
          "Access-Control-Allow-Origin": "*",
          "Accept-Ranges": "bytes",
          "Content-Type": contentType,
          "Content-Length": end - start + 1,
          ...(range.kind === "range"
            ? { "Content-Range": `bytes ${start}-${end}/${info.size}` }
            : {}),
        });

        if (req.method === "HEAD" || info.size === 0) {
          res.end();
          return;
        }
        createReadStream(filePath, { start, end }).pipe(res);
      } catch {
        if (!res.headersSent) {
          send(res, 400);
        } else {
          res.destroy();
        }
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
