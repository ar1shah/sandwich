// Checks a bulk-add paste against every rule the save applies, so the preview shows exactly
// what will be stored (docs/reference/SPEC.md section 2, DECISIONS #32). Pure.
//
// Per line: unreadable lines, text over the cap and anything past the 200-item limit are
// errors (they need fixing); repeats inside the paste and captions already in the bank are
// duplicates (skipped unless allowed). Line numbers are the paste's own.
import { parseBulkLines } from "./bulkPaste";
import type { CaptionSlot } from "./captionFilter";
import {
  BULK_ADD_MAX,
  CAPTION_TEXT_MAX,
  captionKey,
  type DuplicateKey,
} from "./captions";

export type BulkLine =
  | { kind: "ok"; line: number; raw: string; slot: CaptionSlot; text: string }
  | { kind: "error"; line: number; raw: string; message: string }
  | {
      kind: "duplicate";
      line: number;
      raw: string;
      slot: CaptionSlot;
      text: string;
      // "bank" = already saved; a number = the first line of the paste with the same caption.
      of: "bank" | number;
      message: string;
    };

export type BulkValidation = {
  lines: BulkLine[];
  // Exactly what to send to main: ok lines, plus duplicates when they are allowed. Never more
  // than BULK_ADD_MAX, never over-long, so the save cannot reject the batch.
  items: { slot: CaptionSlot; text: string }[];
  errors: Extract<BulkLine, { kind: "error" }>[];
  duplicates: Extract<BulkLine, { kind: "duplicate" }>[];
};

export function validateBulkCaptions(
  input: string,
  options: {
    // The product every line is added to (null = generic).
    productId: string | null;
    existing: readonly DuplicateKey[];
    allowDuplicates?: boolean;
  },
): BulkValidation {
  const bank = new Set(options.existing.map(captionKey));
  const firstSeen = new Map<string, number>();
  const lines: BulkLine[] = [];
  const items: BulkValidation["items"] = [];

  for (const parsed of parseBulkLines(input)) {
    if (!parsed.ok) {
      lines.push({
        kind: "error",
        line: parsed.line,
        raw: parsed.raw,
        message: parsed.message,
      });
      continue;
    }
    const { line, raw, slot, text } = parsed;
    if (text.length > CAPTION_TEXT_MAX) {
      lines.push({
        kind: "error",
        line,
        raw,
        message: `Too long (${text.length} characters, ${CAPTION_TEXT_MAX} at most).`,
      });
      continue;
    }

    const key = captionKey({ text, slot, productId: options.productId });
    const earlier = firstSeen.get(key);
    if (earlier === undefined) {
      firstSeen.set(key, line);
    }
    let entry: BulkLine;
    if (bank.has(key)) {
      entry = {
        kind: "duplicate",
        line,
        raw,
        slot,
        text,
        of: "bank",
        message: "Already in bank.",
      };
    } else if (earlier !== undefined) {
      entry = {
        kind: "duplicate",
        line,
        raw,
        slot,
        text,
        of: earlier,
        message: `Repeated on line ${earlier}.`,
      };
    } else {
      entry = { kind: "ok", line, raw, slot, text };
    }

    if (entry.kind === "duplicate" && !options.allowDuplicates) {
      lines.push(entry);
      continue;
    }
    if (items.length >= BULK_ADD_MAX) {
      lines.push({
        kind: "error",
        line,
        raw,
        message: `Only ${BULK_ADD_MAX} captions can be added at once. Add the rest next.`,
      });
      continue;
    }
    items.push({ slot, text });
    lines.push(entry);
  }

  return {
    lines,
    items,
    errors: lines.filter(
      (l): l is Extract<BulkLine, { kind: "error" }> => l.kind === "error",
    ),
    duplicates: lines.filter(
      (l): l is Extract<BulkLine, { kind: "duplicate" }> =>
        l.kind === "duplicate",
    ),
  };
}
