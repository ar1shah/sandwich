import path from "node:path";
import { assertRelativeLibraryPath } from "../../shared/libraryPaths";

// Subset of the path module so tests can run posix and win32 semantics.
export type PathModule = Pick<
  typeof path,
  "join" | "relative" | "isAbsolute" | "resolve" | "sep"
>;

// Library-relative (forward slashes, as stored in the DB) -> absolute, with the same
// segment rules as the media server. Throws on anything that could leave the root.
export function toAbsolute(
  root: string,
  relativePath: string,
  pathModule: PathModule = path,
): string {
  assertRelativeLibraryPath(relativePath);
  return pathModule.join(root, ...relativePath.split("/"));
}

// Absolute path inside the root -> library-relative with forward slashes.
export function toRelative(
  root: string,
  absolutePath: string,
  pathModule: PathModule = path,
): string {
  const relative = pathModule.relative(
    pathModule.resolve(root),
    pathModule.resolve(absolutePath),
  );
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${pathModule.sep}`) ||
    pathModule.isAbsolute(relative)
  ) {
    throw new Error(`"${absolutePath}" is not inside the library "${root}".`);
  }
  return assertRelativeLibraryPath(relative.split(pathModule.sep).join("/"));
}
