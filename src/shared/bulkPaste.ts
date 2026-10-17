import { CAPTION_SLOTS, type CaptionSlot } from "./captionFilter";

// Bulk caption format (docs/reference/SPEC.md section 2), one caption per line:
//   before | I can't fix my smile lines, it's genetics
//   any | 10/10 {product}
// No "|" means slot "any". A literal \n inside the text becomes a line break. Only the first "|"
// splits, so the text itself may contain pipes.

export type ParsedCaption = { slot: CaptionSlot; text: string };
export type BulkPasteError = { line: number; message: string; raw: string };
export type BulkPasteResult = {
  captions: ParsedCaption[];
  errors: BulkPasteError[];
};

// One non-blank input line: either a caption or the reason it could not be read.
export type BulkParsedLine =
  | { ok: true; line: number; raw: string; slot: CaptionSlot; text: string }
  | { ok: false; line: number; raw: string; message: string };

// Every non-blank line in order, with its real line number (blank lines are skipped but
// still counted).
export function parseBulkLines(input: string): BulkParsedLine[] {
  const lines: BulkParsedLine[] = [];

  input.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "") {
      return;
    }

    let slot: CaptionSlot = "any";
    let body = trimmed;
    const pipe = trimmed.indexOf("|");
    if (pipe !== -1) {
      const slotText = trimmed.slice(0, pipe).trim().toLowerCase();
      if (!isCaptionSlot(slotText)) {
        lines.push({
          ok: false,
          line,
          raw,
          message: `Unknown slot "${trimmed.slice(0, pipe).trim()}". Use ${CAPTION_SLOTS.join(", ")}.`,
        });
        return;
      }
      slot = slotText;
      body = trimmed.slice(pipe + 1);
    }

    const text = body
      .split("\\n")
      .map((part) => part.trim())
      .join("\n")
      .trim();
    if (text === "") {
      lines.push({ ok: false, line, raw, message: "Caption text is empty." });
      return;
    }
    lines.push({ ok: true, line, raw, slot, text });
  });

  return lines;
}

export function parseBulkCaptions(input: string): BulkPasteResult {
  const captions: ParsedCaption[] = [];
  const errors: BulkPasteError[] = [];
  for (const parsed of parseBulkLines(input)) {
    if (parsed.ok) {
      captions.push({ slot: parsed.slot, text: parsed.text });
    } else {
      errors.push({
        line: parsed.line,
        message: parsed.message,
        raw: parsed.raw,
      });
    }
  }
  return { captions, errors };
}

function isCaptionSlot(value: string): value is CaptionSlot {
  return (CAPTION_SLOTS as readonly string[]).includes(value);
}
