// Pure string logic for media server URLs: /m/<token>/<seg>/<seg>...
// Segments are split on "/" first and decoded one by one, mirroring mediaUrl().
// No Node imports: the filesystem containment check lives in src/main/media/pathGuard.ts.

export const MEDIA_URL_PREFIX = "m";

export type MediaRequestParts = {
  token: string; // raw, not decoded
  rawSegments: string[]; // still percent-encoded
};

// Takes the raw request target (req.url), never a WHATWG URL pathname, because
// `new URL()` silently collapses "." and ".." (and their %2e forms).
// Returns null when the URL is not of the form /m/<token>/...
export function parseMediaRequestUrl(
  rawUrl: string | undefined,
): MediaRequestParts | null {
  if (!rawUrl?.startsWith("/")) {
    return null;
  }
  const end = rawUrl.search(/[?#]/);
  const pathname = end === -1 ? rawUrl : rawUrl.slice(0, end);
  const parts = pathname.split("/");
  // parts[0] is "" (leading slash).
  if (parts[1] !== MEDIA_URL_PREFIX || !parts[2]) {
    return null;
  }
  return { token: parts[2], rawSegments: parts.slice(3) };
}

export type DecodedSegments =
  | { ok: true; segments: string[] }
  | { ok: false; reason: "bad-encoding" | "forbidden" };

// ":" blocks Windows drive letters and NTFS alternate data streams.
const FORBIDDEN_SEGMENT_CHARS = /[\\\0:/]/;

export function decodeMediaSegments(rawSegments: string[]): DecodedSegments {
  if (rawSegments.length === 0) {
    return { ok: false, reason: "forbidden" };
  }
  const segments: string[] = [];
  for (const raw of rawSegments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return { ok: false, reason: "bad-encoding" };
    }
    if (
      decoded === "" ||
      decoded === "." ||
      decoded === ".." ||
      FORBIDDEN_SEGMENT_CHARS.test(decoded)
    ) {
      return { ok: false, reason: "forbidden" };
    }
    segments.push(decoded);
  }
  return { ok: true, segments };
}
