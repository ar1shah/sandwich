import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startMediaServer,
  type MediaServer,
} from "../src/main/media/mediaServer";

type Reply = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
};

// node:http with a raw path, because fetch/URL would collapse "../" before sending.
function request(
  server: MediaServer,
  method: string,
  rawPath: string,
  headers: Record<string, string> = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: server.port, method, path: rawPath, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const CONTENT = Buffer.from("0123456789abcdefghijklmnopqrstuvwxyz");

describe("media server", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "media-server-"));
  const root = path.join(base, "root");
  const outside = path.join(base, "outside");
  let currentRoot: string | null = root;
  let server: MediaServer;
  let prefix: string; // /m/<token>
  let token: string;

  beforeAll(async () => {
    mkdirSync(path.join(root, "sub dir"), { recursive: true });
    mkdirSync(outside);
    writeFileSync(path.join(root, "clip.mp4"), CONTENT);
    writeFileSync(path.join(root, "sub dir", "pic #1.jpg"), "jpg");
    writeFileSync(path.join(root, "empty.mp4"), "");
    writeFileSync(path.join(root, "data.json"), "{}");
    writeFileSync(path.join(root, "weird.xyz"), "?");
    writeFileSync(path.join(outside, "secret.txt"), "secret");
    symlinkSync(outside, path.join(root, "escape"));
    server = await startMediaServer({ getRoot: () => currentRoot });
    prefix = new URL(server.baseUrl).pathname;
    token = prefix.split("/")[2] ?? "";
  });

  afterAll(async () => {
    await server.close();
    rmSync(base, { recursive: true, force: true });
  });

  const get = (rel: string, headers?: Record<string, string>) =>
    request(server, "GET", `${prefix}/${rel}`, headers);

  it("binds loopback with a long random token", () => {
    expect(server.baseUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/m\/[\w-]{20,}$/,
    );
  });

  it("serves a full file", async () => {
    const reply = await get("clip.mp4");
    expect(reply.status).toBe(200);
    expect(reply.body.equals(CONTENT)).toBe(true);
    expect(reply.headers["content-length"]).toBe(String(CONTENT.length));
    expect(reply.headers["content-type"]).toBe("video/mp4");
    expect(reply.headers["accept-ranges"]).toBe("bytes");
    expect(reply.headers["access-control-allow-origin"]).toBe("*");
    expect(reply.headers["access-control-expose-headers"]).toContain(
      "Content-Range",
    );
    expect(reply.headers["cache-control"]).toBe("private, max-age=3600");
    expect(reply.headers.etag).toBeTruthy();
    expect(reply.headers["last-modified"]).toBeTruthy();
  });

  it("serves content types by extension", async () => {
    expect((await get("data.json")).headers["content-type"]).toBe(
      "application/json",
    );
    expect(
      (await get("sub%20dir/pic%20%231.jpg")).headers["content-type"],
    ).toBe("image/jpeg");
    expect((await get("weird.xyz")).headers["content-type"]).toBe(
      "application/octet-stream",
    );
  });

  it("serves a byte range with 206", async () => {
    const reply = await get("clip.mp4", { Range: "bytes=2-5" });
    expect(reply.status).toBe(206);
    expect(reply.body.toString()).toBe("2345");
    expect(reply.headers["content-range"]).toBe(`bytes 2-5/${CONTENT.length}`);
    expect(reply.headers["content-length"]).toBe("4");
  });

  it("serves open-ended and suffix ranges", async () => {
    const open = await get("clip.mp4", { Range: "bytes=30-" });
    expect(open.status).toBe(206);
    expect(open.body.toString()).toBe("uvwxyz");
    const suffix = await get("clip.mp4", { Range: "bytes=-3" });
    expect(suffix.status).toBe(206);
    expect(suffix.body.toString()).toBe("xyz");
    expect(suffix.headers["content-range"]).toBe(
      `bytes 33-35/${CONTENT.length}`,
    );
  });

  it("returns 416 for an unsatisfiable range", async () => {
    const reply = await get("clip.mp4", { Range: "bytes=500-600" });
    expect(reply.status).toBe(416);
    expect(reply.headers["content-range"]).toBe(`bytes */${CONTENT.length}`);
  });

  it("serves the full file for a multi-range header", async () => {
    const reply = await get("clip.mp4", { Range: "bytes=0-1,4-5" });
    expect(reply.status).toBe(200);
    expect(reply.body.equals(CONTENT)).toBe(true);
  });

  it("serves an empty file, and returns 416 for any range on it", async () => {
    const full = await get("empty.mp4");
    expect(full.status).toBe(200);
    expect(full.headers["content-length"]).toBe("0");
    expect(full.body.length).toBe(0);
    expect((await get("empty.mp4", { Range: "bytes=0-" })).status).toBe(416);
    expect((await get("empty.mp4", { Range: "bytes=0-0" })).status).toBe(416);
    expect((await get("empty.mp4", { Range: "bytes=-1" })).status).toBe(416);
  });

  it("answers HEAD with GET's headers and no body", async () => {
    const getReply = await get("clip.mp4");
    const head = await request(server, "HEAD", `${prefix}/clip.mp4`);
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    for (const name of [
      "content-length",
      "content-type",
      "accept-ranges",
      "etag",
      "last-modified",
      "cache-control",
      "access-control-allow-origin",
      "access-control-expose-headers",
    ]) {
      expect(head.headers[name]).toBe(getReply.headers[name]);
    }
    const headRange = await request(server, "HEAD", `${prefix}/clip.mp4`, {
      Range: "bytes=0-3",
    });
    expect(headRange.status).toBe(206);
    expect(headRange.headers["content-length"]).toBe("4");
    expect(headRange.body.length).toBe(0);
  });

  it("returns 304 for a matching If-None-Match", async () => {
    const first = await get("clip.mp4");
    const second = await get("clip.mp4", {
      "If-None-Match": String(first.headers.etag),
    });
    expect(second.status).toBe(304);
  });

  it("changes the ETag when the file is replaced at the same path", async () => {
    const file = path.join(root, "replace.mp4");
    writeFileSync(file, "one");
    utimesSync(file, 1_000_000, 1_000_000);
    const before = await get("replace.mp4");
    writeFileSync(file, "three");
    utimesSync(file, 2_000_000, 2_000_000);
    const after = await get("replace.mp4");
    expect(after.headers.etag).not.toBe(before.headers.etag);
    expect(after.body.toString()).toBe("three");
  });

  it("rejects a wrong token with 403", async () => {
    const wrong = await request(server, "GET", "/m/not-the-token/clip.mp4");
    expect(wrong.status).toBe(403);
    expect(wrong.body.length).toBe(0);
    const swapped = await request(
      server,
      "GET",
      `/m/${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}/clip.mp4`,
    );
    expect(swapped.status).toBe(403);
  });

  it("rejects wrong-length tokens with 403 instead of crashing", async () => {
    expect((await request(server, "GET", "/m/x/clip.mp4")).status).toBe(403);
    expect(
      (await request(server, "GET", `/m/${token}${token}/clip.mp4`)).status,
    ).toBe(403);
    // Still alive afterwards.
    expect((await get("clip.mp4")).status).toBe(200);
  });

  it("returns 404 for URLs outside /m/<token>/", async () => {
    expect((await request(server, "GET", "/")).status).toBe(404);
    expect((await request(server, "GET", "/clip.mp4")).status).toBe(404);
    expect((await request(server, "GET", "/m/")).status).toBe(404);
  });

  it.each([
    ["dot dot", "../outside/secret.txt"],
    ["dot dot at the end", ".."],
    ["encoded dot dot", "%2e%2e/outside/secret.txt"],
    ["upper-case encoded", "%2E%2E%2Foutside%2Fsecret.txt"],
    [
      "double-encoded slash trick",
      "sub%20dir/%2e%2e/%2e%2e/outside/secret.txt",
    ],
    ["backslash", "..%5Coutside%5Csecret.txt"],
    ["literal backslash", "..\\outside\\secret.txt"],
    ["NUL byte", "clip.mp4%00.txt"],
    ["colon", "C:/Windows/win.ini"],
    ["encoded colon", "C%3A/Windows/win.ini"],
    ["absolute path", "%2Fetc%2Fpasswd"],
    ["empty segment", "sub%20dir//pic%20%231.jpg"],
    ["symlink escape", "escape/secret.txt"],
  ])("blocks traversal: %s", async (_name, rel) => {
    const reply = await get(rel);
    expect(reply.status).toBe(403);
    expect(reply.body.toString()).not.toContain("secret");
  });

  it("returns 400 for malformed percent-encoding", async () => {
    expect((await get("%")).status).toBe(400);
    expect((await get("clip%ZZ.mp4")).status).toBe(400);
  });

  it("returns 404 for missing files and directories", async () => {
    expect((await get("nope.mp4")).status).toBe(404);
    expect((await get("sub%20dir")).status).toBe(404);
    expect((await get("sub%20dir/missing/clip.mp4")).status).toBe(404);
  });

  it("answers OPTIONS preflight with 204", async () => {
    const reply = await request(server, "OPTIONS", `${prefix}/clip.mp4`);
    expect(reply.status).toBe(204);
    expect(reply.headers["access-control-allow-origin"]).toBe("*");
    expect(reply.headers["access-control-allow-methods"]).toBe(
      "GET, HEAD, OPTIONS",
    );
    expect(reply.headers["access-control-allow-headers"]).toBe("Range");
  });

  it("returns 405 with Allow for other methods", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) {
      const reply = await request(server, method, `${prefix}/clip.mp4`);
      expect(reply.status).toBe(405);
      expect(reply.headers.allow).toBe("GET, HEAD, OPTIONS");
    }
  });

  it("returns 503 when there is no root, then recovers without a restart", async () => {
    currentRoot = null;
    expect((await get("clip.mp4")).status).toBe(503);
    currentRoot = path.join(base, "does-not-exist");
    expect((await get("clip.mp4")).status).toBe(503);
    currentRoot = root;
    expect((await get("clip.mp4")).status).toBe(200);
  });

  it("serves from a root reached through a symlink", async () => {
    const link = path.join(base, "root-link");
    symlinkSync(root, link);
    currentRoot = link;
    try {
      expect((await get("clip.mp4")).status).toBe(200);
      expect((await get("escape/secret.txt")).status).toBe(403);
    } finally {
      currentRoot = root;
    }
  });
});
