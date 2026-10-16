// slugify per docs/reference/SPEC.md section 6: lowercase ASCII [a-z0-9-], collapsed dashes,
// apostrophes stripped ("can't" -> "cant"), safe as a file or folder name on Windows too.

const APOSTROPHES = /['‘’ʼ`´]/g;

// Letters NFKD does not decompose into base letter + accent.
const TRANSLITERATE: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ł: "l",
  ð: "d",
  þ: "th",
};

const WINDOWS_RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

export type SlugifyOptions = {
  maxLength?: number;
  // Returned when nothing usable is left (empty input, emoji only). Default "untitled".
  fallback?: string;
};

export function isWindowsReservedName(name: string): boolean {
  return WINDOWS_RESERVED.has(name.toLowerCase());
}

export function slugify(text: string, options: SlugifyOptions = {}): string {
  const { maxLength, fallback = "untitled" } = options;

  let slug = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(APOSTROPHES, "")
    .toLowerCase()
    .replace(/[ßæœøđłðþ]/g, (c) => TRANSLITERATE[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (maxLength !== undefined && slug.length > maxLength) {
    slug = slug.slice(0, Math.max(0, maxLength)).replace(/-+$/g, "");
  }

  if (slug === "") {
    return fallback;
  }
  if (isWindowsReservedName(slug)) {
    return `${slug}-1`;
  }
  return slug;
}
