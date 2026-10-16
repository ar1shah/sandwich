// Builds a media server URL from the base URL (which already carries /m/<token>)
// and a library-relative path. Each segment is percent-encoded on its own.

const FORBIDDEN_SEGMENT_CHARS = /[\0:]/;

export function mediaUrl(baseUrl: string, relPath: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const segments = relPath.replace(/\\/g, "/").replace(/^\/+/, "").split("/");
  for (const segment of segments) {
    if (
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      FORBIDDEN_SEGMENT_CHARS.test(segment)
    ) {
      throw new Error(`Invalid media path: ${JSON.stringify(relPath)}`);
    }
  }
  return `${base}/${segments.map(encodeURIComponent).join("/")}`;
}
