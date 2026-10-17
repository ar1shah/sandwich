// Library-relative paths as stored in the database (CLAUDE.md golden rule 3): forward
// slashes, never absolute, never leaving the library root. Pure string logic; the
// conversion to and from absolute paths lives in src/main/db/libraryPaths.ts.
import { isSafePathSegment } from "./mediaPath";

export type RelativePathCheck =
  | { ok: true; path: string }
  | { ok: false; reason: string };

export function checkRelativeLibraryPath(input: string): RelativePathCheck {
  if (input === "") {
    return { ok: false, reason: "is empty" };
  }
  if (input.includes("\\")) {
    return { ok: false, reason: "must use forward slashes" };
  }
  if (input.startsWith("/")) {
    return { ok: false, reason: "must not be absolute" };
  }
  for (const segment of input.split("/")) {
    if (!isSafePathSegment(segment)) {
      return { ok: false, reason: `has an unsafe segment "${segment}"` };
    }
  }
  return { ok: true, path: input };
}

// Throws on anything checkRelativeLibraryPath rejects. Returns the path unchanged.
export function assertRelativeLibraryPath(
  input: string,
  label = "path",
): string {
  const result = checkRelativeLibraryPath(input);
  if (!result.ok) {
    throw new Error(`Library ${label} "${input}" ${result.reason}.`);
  }
  return result.path;
}
