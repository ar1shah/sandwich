import { realpath } from "node:fs/promises";
import path from "node:path";

// Subset of the path module we need, so tests can exercise posix and win32 semantics.
// path.win32.relative compares case-insensitively, which gives the Windows behavior.
export type PathModule = Pick<
  typeof path,
  "resolve" | "relative" | "isAbsolute" | "sep"
>;

// Lexical check: resolves `requested` against `root` and returns the absolute path only
// if it stays inside `root`. Returns null for traversal, absolute escapes, NUL bytes, or
// the root itself. Does not touch the filesystem.
export function resolveInside(
  root: string,
  requested: string,
  pathModule: PathModule = path,
): string | null {
  if (requested.includes("\0")) {
    return null;
  }
  const rootResolved = pathModule.resolve(root);
  const target = pathModule.resolve(rootResolved, requested);
  const relative = pathModule.relative(rootResolved, target);

  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${pathModule.sep}`) ||
    pathModule.isAbsolute(relative)
  ) {
    return null;
  }
  return target;
}

export type RealResolveResult =
  | { kind: "ok"; path: string }
  | { kind: "outside" } // lexically or via a symlink, leaves the root
  | { kind: "missing" } // target does not exist
  | { kind: "no-root" }; // root itself cannot be resolved

// Filesystem-aware check. Both the root and the target are realpath'd before comparing,
// so a symlink inside the root cannot escape and a root reached through a symlink
// (macOS /var -> /private/var) still matches.
export async function resolveInsideReal(
  root: string,
  segments: string[],
): Promise<RealResolveResult> {
  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    return { kind: "no-root" };
  }

  const lexical = resolveInside(rootReal, segments.join("/"));
  if (!lexical) {
    return { kind: "outside" };
  }

  let targetReal: string;
  try {
    targetReal = await realpath(lexical);
  } catch {
    return { kind: "missing" };
  }
  return resolveInside(rootReal, targetReal)
    ? { kind: "ok", path: targetReal }
    : { kind: "outside" };
}
