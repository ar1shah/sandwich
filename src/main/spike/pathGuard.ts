import path from "node:path";

// Subset of the path module we need, so tests can exercise posix and win32 semantics.
export type PathModule = Pick<
  typeof path,
  "resolve" | "relative" | "isAbsolute" | "sep"
>;

// Resolves `requested` against `root` and returns the absolute path only if it stays
// inside `root`. Returns null for traversal, absolute escapes, NUL bytes, or the root itself.
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
