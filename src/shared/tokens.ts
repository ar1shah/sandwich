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
