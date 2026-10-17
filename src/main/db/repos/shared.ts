import { randomUUID } from "node:crypto";
import { assertRelativeLibraryPath } from "../../../shared/libraryPaths";

// Injectable so tests get stable ids and timestamps.
export type RepoDeps = {
  now: () => string;
  newId: () => string;
};

export const defaultRepoDeps: RepoDeps = {
  now: () => new Date().toISOString(),
  newId: () => randomUUID(),
};

export function checkedPath(
  value: string | null | undefined,
  label: string,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return assertRelativeLibraryPath(value, label);
}

// Escapes % _ and \ for a LIKE ... ESCAPE '\' pattern.
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function isUniqueViolation(error: unknown, column: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_UNIQUE" &&
    error.message.includes(column)
  );
}
