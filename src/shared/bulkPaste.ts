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

export function parseBulkCaptions(input: string): BulkPasteResult {
  const captions: ParsedCaption[] = [];
  const errors: BulkPasteError[] = [];

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
        errors.push({
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
      errors.push({ line, raw, message: "Caption text is empty." });
      return;
    }
    captions.push({ slot, text });
  });

  return { captions, errors };
}

function isCaptionSlot(value: string): value is CaptionSlot {
  return (CAPTION_SLOTS as readonly string[]).includes(value);
}
