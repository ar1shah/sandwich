import { useEffect, useMemo, useState } from "react";
import { layoutCaption } from "../../../../remotion/captionGeometry";
import { loadCaptionFont } from "../../../../remotion/fonts";
import { captionFit } from "../../../shared/captionLayout";
import { CAPTION_TEXT_MAX } from "../../../shared/captions";
import { SLOTS, type Slot } from "../../../shared/recipe";
import { tokenizeProductNames } from "../../../shared/tokens";
import { CaptionFormModal } from "../captions/CaptionFormModal";
import { CaptionPicker } from "../captions/CaptionPicker";
import { INPUT, SECONDARY, Warning } from "../captions/captionUi";
import { useEditorStore } from "../editor/editorStore";
import { usePreviewStore } from "../preview/previewStore";
import { SegmentedControl } from "./SegmentedControl";

const STYLE_OPTIONS = [
  { value: "outline", label: "Outline" },
  { value: "box", label: "Box" },
] as const;
const POSITION_OPTIONS = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
] as const;

// Show a character count once the text gets close to the bank's limit.
const COUNTER_FROM = Math.floor(CAPTION_TEXT_MAX * 0.8);

type FontState = "loading" | "ready" | "failed";

// Whether the caption font is usable for measuring. A layout measured before it is loaded
// would use fallback metrics, so nothing is judged until then.
function useCaptionFont(): FontState {
  const [state, setState] = useState<FontState>("loading");
  useEffect(() => {
    let active = true;
    loadCaptionFont().then(
      () => active && setState("ready"),
      () => active && setState("failed"),
    );
    return () => {
      active = false;
    };
  }, []);
  return state;
}

// Caption part of the clip panel: pick from the bank, edit the text, look, save to bank.
// Editing the text never changes the bank (only "Save to bank" writes to it).
export const CaptionSection: React.FC<{ slot: Slot }> = ({ slot }) => {
  const caption = useEditorStore(
    (s) => s.draft?.clips[SLOTS.indexOf(slot)].caption ?? null,
  );
  const product = useEditorStore((s) => s.product);
  const productId = useEditorStore((s) => s.draft?.productId);
  const pickCaption = useEditorStore((s) => s.pickCaption);
  const setCaptionText = useEditorStore((s) => s.setCaptionText);
  const setCaptionLook = useEditorStore((s) => s.setCaptionLook);
  const clearCaption = useEditorStore((s) => s.clearCaption);
  const adoptCaptionSource = useEditorStore((s) => s.adoptCaptionSource);
  const requestSeek = usePreviewStore((s) => s.requestSeek);
  const font = useCaptionFont();
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const text = caption?.text ?? "";
  const style = caption?.style ?? "outline";
  const position = caption?.position ?? "middle";
  const hasText = text.trim() !== "";

  // The same layout the preview and the export use. Recomputed when the text or the style
  // changes (box reserves more width). No verdict for empty text or an unusable font.
  const fit = useMemo(() => {
    if (font !== "ready" || !hasText) {
      return null;
    }
    try {
      return captionFit(layoutCaption({ text, style }));
    } catch {
      return null;
    }
  }, [font, hasText, text, style]);

  // A look change shows up where you are looking: jump to this clip only when the
  // playhead is somewhere else.
  const showClip = () => requestSeek({ slot }, { onlyIfOutside: true });

  if (!productId) {
    return null;
  }

  return (
    <section
      aria-label="Caption"
      className="space-y-3"
      data-testid="caption-section"
    >
      <h3 className="text-xs font-medium uppercase tracking-wide text-app-muted">
        Caption
      </h3>

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="caption-pick"
          onClick={() => setPicking(true)}
          className={`${SECONDARY} flex-1 px-3 py-1.5 text-xs`}
        >
          Pick caption
        </button>
        <button
          type="button"
          data-testid="caption-clear"
          disabled={caption === null}
          onClick={() => {
            clearCaption(slot);
            setSaved(false);
          }}
          className={`${SECONDARY} px-3 py-1.5 text-xs`}
        >
          Clear caption
        </button>
      </div>

      <div>
        <textarea
          data-testid="caption-text"
          aria-label="Caption text"
          rows={3}
          maxLength={CAPTION_TEXT_MAX}
          value={text}
          placeholder="Pick a caption or type your own"
          onChange={(event) => {
            setCaptionText(slot, event.target.value);
            setSaved(false);
          }}
          className={`${INPUT} resize-y`}
        />
        {text.length >= COUNTER_FROM && (
          <p
            className="mt-1 text-right text-xs tabular-nums text-app-dim"
            data-testid="caption-counter"
          >
            {text.length}/{CAPTION_TEXT_MAX}
          </p>
        )}
      </div>

      {fit === "small" && (
        <div data-testid="caption-warning-small">
          <Warning message="This caption is long, so it is drawn smaller to fit. It may be hard to read on a phone. Shorten it or add a line break." />
        </div>
      )}
      {fit === "overflow" && (
        <div data-testid="caption-warning-overflow">
          <Warning message="This caption is too long to fit in three lines at a readable size. Shorten it." />
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <SegmentedControl
            label="Style"
            testId="caption-style"
            value={style}
            options={STYLE_OPTIONS}
            disabled={caption === null}
            onChange={(value) => {
              setCaptionLook(slot, { style: value });
              showClip();
            }}
          />
        </div>
        <div className="flex-1">
          <SegmentedControl
            label="Position"
            testId="caption-position"
            value={position}
            options={POSITION_OPTIONS}
            disabled={caption === null}
            onChange={(value) => {
              setCaptionLook(slot, { position: value });
              showClip();
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="caption-save"
          disabled={!hasText}
          onClick={() => setSaving(true)}
          className={`${SECONDARY} px-3 py-1.5 text-xs`}
        >
          Save to bank
        </button>
        {saved && (
          <span
            role="status"
            data-testid="caption-saved"
            className="text-xs text-app-muted"
          >
            Saved to the caption bank.
          </span>
        )}
      </div>

      {picking && (
        <CaptionPicker
          slot={slot}
          productId={productId}
          onClose={() => setPicking(false)}
          onSelect={(picked, resolved) => {
            pickCaption(slot, picked, resolved);
            setPicking(false);
            setSaved(false);
            showClip();
          }}
        />
      )}
      {saving && (
        <CaptionFormModal
          mode={{
            kind: "create",
            // The editor holds the resolved name; the bank should hold the token.
            text: product ? tokenizeProductNames(text, product) : text,
            slot,
            productId,
          }}
          onClose={() => setSaving(false)}
          onSaved={(created) => {
            adoptCaptionSource(slot, created.id);
            setSaved(true);
          }}
        />
      )}
    </section>
  );
};
