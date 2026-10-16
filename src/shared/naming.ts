import { slugify } from "./slug";

// Export naming (docs/reference/SPEC.md section 6):
//   {productSlug}_{hook}_{date}_{n}.mp4  in  exports/<productSlug>/<date>/
// The hook is built from the before caption: single-letter words ("I", "a") and emoji-only or
// symbol-only words are skipped (single digits like "3" are kept), then the next 4 words are
// slugified and capped at 30 chars.

export const HOOK_WORD_COUNT = 4;
export const HOOK_MAX_LENGTH = 30;
export const NO_CAPTION_HOOK = "no-caption";

// Local calendar date as YYYY-MM-DD. Local getters on purpose: toISOString() is UTC and would
// roll over to tomorrow in the evening for anyone west of Greenwich.
export function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildHook(caption: string): string {
  const words = caption
    .split(/\s+/)
    .map((word) => slugify(word, { fallback: "" }))
    .filter((word) => word.length > 1 || /^[0-9]$/.test(word))
    .slice(0, HOOK_WORD_COUNT);
  const hook = slugify(words.join("-"), {
    maxLength: HOOK_MAX_LENGTH,
    fallback: "",
  });
  return hook === "" ? NO_CAPTION_HOOK : hook;
}

export type BuildExportNameInput = {
  productSlug: string;
  beforeCaption: string;
  date: Date;
  // File names already in the target folder; matched case-insensitively.
  existingNames: Iterable<string>;
};

export type ExportName = {
  // Relative to the library root. Main joins them with path.join.
  folderSegments: [string, string, string];
  fileName: string;
  sidecarName: string;
};

export function buildExportName(input: BuildExportNameInput): ExportName {
  const taken = new Set<string>();
  for (const name of input.existingNames) {
    taken.add(name.toLowerCase());
  }

  const dateText = formatLocalDate(input.date);
  const hook = buildHook(input.beforeCaption);
  const base = `${input.productSlug}_${hook}_${dateText}`;

  for (let n = 1; ; n++) {
    const counter = String(n).padStart(2, "0"); // 01..99, then 100, 101, ...
    const fileName = `${base}_${counter}.mp4`;
    const sidecarName = `${base}_${counter}.recipe.json`;
    if (
      !taken.has(fileName.toLowerCase()) &&
      !taken.has(sidecarName.toLowerCase())
    ) {
      return {
        folderSegments: ["exports", input.productSlug, dateText],
        fileName,
        sidecarName,
      };
    }
  }
}
