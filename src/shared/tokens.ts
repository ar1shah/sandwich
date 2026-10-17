// Caption tokens (docs/reference/SPEC.md section 2):
//   {product} and {short}: short name, falling back to the full name
//   {full}: always the full name
// Matching ignores case ({Product} works). Unknown tokens are left as typed and reported so
// the UI can warn. A single pass: a product name that itself contains "{full}" is not re-expanded.

export type TokenProduct = {
  fullName: string;
  shortName?: string | null;
};

export type ResolvedTokens = {
  text: string;
  // Unknown tokens exactly as typed (with braces), each once, in order of first appearance.
  unknownTokens: string[];
};

const TOKEN_PATTERN = /\{([A-Za-z_][A-Za-z0-9_-]*)\}/g;

export function resolveTokens(
  text: string,
  product: TokenProduct,
): ResolvedTokens {
  const short = product.shortName?.trim() ? product.shortName.trim() : null;
  const values: Record<string, string> = {
    product: short ?? product.fullName,
    short: short ?? product.fullName,
    full: product.fullName,
  };

  const unknown: string[] = [];
  const resolved = text.replace(TOKEN_PATTERN, (match, name: string) => {
    const value = values[name.toLowerCase()];
    if (value === undefined) {
      if (!unknown.includes(match)) {
        unknown.push(match);
      }
      return match;
    }
    return value;
  });

  return { text: resolved, unknownTokens: unknown };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The inverse of resolveTokens, for "Save to bank": editor text holds the resolved product
// name, the bank should hold the token. The full name becomes {full} and the short name
// {product}; with no short name the full name becomes {product}. One pass over a pattern
// that tries the longer name first, so a short name inside the full name never splits it.
// Case-insensitive, whole words only (a name cannot start or end inside a longer word);
// everything else is left as it is.
export function tokenizeProductNames(
  text: string,
  product: TokenProduct,
): string {
  const full = product.fullName.trim();
  const shortTrimmed = product.shortName?.trim() ?? "";
  const hasShort =
    shortTrimmed !== "" && shortTrimmed.toLowerCase() !== full.toLowerCase();

  const entries: { name: string; token: string }[] = [];
  if (full !== "") {
    entries.push({ name: full, token: hasShort ? "{full}" : "{product}" });
  }
  if (hasShort) {
    entries.push({ name: shortTrimmed, token: "{product}" });
  }
  if (entries.length === 0) {
    return text;
  }
  entries.sort((a, b) => b.name.length - a.name.length);

  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${entries.map((e) => escapeRegExp(e.name)).join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  return text.replace(pattern, (match) => {
    const lower = match.toLowerCase();
    return entries.find((e) => e.name.toLowerCase() === lower)?.token ?? match;
  });
}
